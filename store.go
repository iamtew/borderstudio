package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

type point struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Smooth bool    `json:"smooth,omitempty"`
	Ix     float64 `json:"ix,omitempty"` // incoming handle, absolute
	Iy     float64 `json:"iy,omitempty"`
	Ox     float64 `json:"ox,omitempty"` // outgoing handle, absolute
	Oy     float64 `json:"oy,omitempty"`
}

type ctrlEvent struct {
	ID    string      `json:"id"`
	Label string      `json:"label"`
	Anim  string      `json:"anim"` // named one-shot from overlay catalog
	Tune  *motionTune `json:"tune,omitempty"`
}

type design struct {
	Width       int         `json:"width"`
	Height      int         `json:"height"`
	Kind        string      `json:"kind,omitempty"` // polygon | roundrect | circle | oval
	Points      []point     `json:"points,omitempty"`
	X           float64     `json:"x,omitempty"`
	Y           float64     `json:"y,omitempty"`
	W           float64     `json:"w,omitempty"`
	H           float64     `json:"h,omitempty"`
	R           float64     `json:"r,omitempty"` // roundrect corner radius
	Stroke      string      `json:"stroke"`
	StrokeWidth float64     `json:"strokeWidth"`
	Glow        float64     `json:"glow"`
	Blur        float64     `json:"blur"`
	Feather     float64     `json:"feather"`
	Dash        bool        `json:"dash"`
	Motion      string      `json:"motion,omitempty"`
	MotionTune  *motionTune `json:"motionTune,omitempty"`
	Events      []ctrlEvent `json:"events"`
}

type motionTune struct {
	Ms       float64 `json:"ms"`
	Ease     string  `json:"ease"`
	Color    string  `json:"color,omitempty"`
	Strength float64 `json:"strength"`
}

type colorPalette struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Colors []string `json:"colors"`
}

type palettesDoc struct {
	Selected string         `json:"selected"`
	Custom   []colorPalette `json:"custom"`
}

type store struct {
	db *sql.DB
}

func openStore(dir string) (*store, design, error) {
	// busy_timeout waits out short locks (OneDrive/antivirus touching the file)
	// instead of failing with "database is locked".
	db, err := sql.Open("sqlite", filepath.Join(dir, "border.db")+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, design{}, err
	}
	// One connection serializes every write, including handlers that do not hold the design mutex.
	db.SetMaxOpenConns(1)
	st := &store{db: db}
	if err := st.init(); err != nil {
		db.Close()
		return nil, design{}, err
	}
	d, err := st.load()
	if err != nil {
		db.Close()
		return nil, design{}, err
	}
	return st, d, nil
}

func (st *store) close() { _ = st.db.Close() }

func (st *store) init() error {
	_, err := st.db.Exec(`
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);`)
	return err
}

func (st *store) load() (design, error) {
	var raw string
	err := st.db.QueryRow(`SELECT v FROM kv WHERE k = 'design'`).Scan(&raw)
	if err == sql.ErrNoRows {
		d := defaultDesign()
		if err := st.save(d); err != nil {
			return design{}, err
		}
		return d, nil
	}
	if err != nil {
		return design{}, err
	}
	var d design
	err = json.Unmarshal([]byte(raw), &d)
	if err == nil {
		err = validateDesign(d)
	}
	if err != nil {
		// A bad row must not brick startup. Park it in design.bad so nothing is
		// lost, then start over from the default hole.
		log.Printf("stored design unusable (%v); kept as design.bad, using default", err)
		if err := st.setKV("design.bad", raw); err != nil {
			return design{}, err
		}
		d = defaultDesign()
		return d, st.save(d)
	}
	d.Feather = clamp(d.Feather, 0, 64)
	d.MotionTune = normalizeMotionTune(d.MotionTune)
	for i := range d.Events {
		d.Events[i].Tune = normalizeMotionTune(d.Events[i].Tune)
	}
	return d, nil
}

func (st *store) save(d design) error {
	if err := validateDesign(d); err != nil {
		return err
	}
	raw, err := json.Marshal(d)
	if err != nil {
		return err
	}
	_, err = st.db.Exec(`INSERT INTO kv(k, v) VALUES('design', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, string(raw))
	return err
}

func (st *store) setKV(k, v string) error {
	_, err := st.db.Exec(`INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, v)
	return err
}

func (st *store) getKV(k string) (string, error) {
	var v string
	err := st.db.QueryRow(`SELECT v FROM kv WHERE k=?`, k).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

func validHex(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if v[0] != '#' {
		v = "#" + v
	}
	n := len(v) - 1
	if n != 3 && n != 4 && n != 6 && n != 8 {
		return ""
	}
	for i := 1; i < len(v); i++ {
		c := v[i]
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return ""
		}
	}
	return v
}

func normalizePalettes(d palettesDoc) palettesDoc {
	out := palettesDoc{Selected: strings.TrimSpace(d.Selected), Custom: []colorPalette{}}
	if out.Selected == "" {
		out.Selected = "basic"
	}
	for _, p := range d.Custom {
		name := strings.TrimSpace(p.Name)
		if name == "" {
			continue
		}
		id := strings.TrimSpace(p.ID)
		if id == "" {
			id = name
		}
		cols := []string{}
		for _, c := range p.Colors {
			if h := validHex(c); h != "" {
				cols = append(cols, h)
			}
		}
		out.Custom = append(out.Custom, colorPalette{ID: id, Name: name, Colors: cols})
	}
	return out
}

func (st *store) palettes() (palettesDoc, error) {
	raw, err := st.getKV("palettes")
	if err != nil {
		return palettesDoc{}, err
	}
	if raw == "" {
		return palettesDoc{Selected: "basic", Custom: []colorPalette{}}, nil
	}
	var d palettesDoc
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		return palettesDoc{Selected: "basic", Custom: []colorPalette{}}, nil
	}
	return normalizePalettes(d), nil
}

func (st *store) savePalettes(d palettesDoc) (palettesDoc, error) {
	d = normalizePalettes(d)
	b, err := json.Marshal(d)
	if err != nil {
		return d, err
	}
	return d, st.setKV("palettes", string(b))
}

// Named snapshots beside the live design. designs = look + hole, masks = hole, boards = events.
type libItem struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Body json.RawMessage `json:"body"`
}

type libDoc struct {
	Selected string    `json:"selected"`
	Items    []libItem `json:"items"`
}

func mintLibID(used map[string]bool) string {
	var b [4]byte
	for {
		_, _ = rand.Read(b[:])
		id := hex.EncodeToString(b[:])
		if !used[id] {
			return id
		}
	}
}

func normalizeLib(key string, doc libDoc) (libDoc, error) {
	out := libDoc{Items: []libItem{}}
	used := map[string]bool{}
	for _, it := range doc.Items {
		name := clipText(it.Name, 60)
		if name == "" {
			continue
		}
		body, err := normalizeLibBody(key, it.Body)
		if err != nil {
			return libDoc{}, err
		}
		id := clipText(it.ID, 42)
		if id == "" || used[id] {
			id = mintLibID(used)
		}
		used[id] = true
		if len(out.Items) >= 64 {
			return libDoc{}, fmt.Errorf("too many items")
		}
		out.Items = append(out.Items, libItem{ID: id, Name: name, Body: body})
	}
	sel := strings.TrimSpace(doc.Selected)
	for _, it := range out.Items {
		if it.ID == sel {
			out.Selected = sel
			break
		}
	}
	return out, nil
}

func normalizeLibBody(key string, raw json.RawMessage) (json.RawMessage, error) {
	switch key {
	case "designs":
		return normalizeDesignBody(raw)
	case "masks":
		return normalizeMaskBody(raw)
	case "boards":
		return normalizeBoardBody(raw)
	default:
		return nil, fmt.Errorf("bad library")
	}
}

func normalizeDesignBody(raw json.RawMessage) (json.RawMessage, error) {
	var d design
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, fmt.Errorf("bad design")
	}
	d.Events = nil
	d.Feather = clamp(d.Feather, 0, 64)
	d.MotionTune = normalizeMotionTune(d.MotionTune)
	if err := validateDesign(d); err != nil {
		return nil, err
	}
	b, err := json.Marshal(d)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	delete(m, "events")
	return json.Marshal(m)
}

func normalizeMaskBody(raw json.RawMessage) (json.RawMessage, error) {
	var d design
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, fmt.Errorf("bad mask")
	}
	d.Stroke = "#000000"
	d.StrokeWidth = 1
	d.Events = nil
	d.MotionTune = nil
	d.Feather = clamp(d.Feather, 0, 64)
	if err := validateDesign(d); err != nil {
		return nil, err
	}
	type maskBody struct {
		Width   int     `json:"width"`
		Height  int     `json:"height"`
		Kind    string  `json:"kind,omitempty"`
		Points  []point `json:"points,omitempty"`
		X       float64 `json:"x,omitempty"`
		Y       float64 `json:"y,omitempty"`
		W       float64 `json:"w,omitempty"`
		H       float64 `json:"h,omitempty"`
		R       float64 `json:"r,omitempty"`
		Feather float64 `json:"feather"`
	}
	return json.Marshal(maskBody{
		Width: d.Width, Height: d.Height, Kind: d.Kind, Points: d.Points,
		X: d.X, Y: d.Y, W: d.W, H: d.H, R: d.R, Feather: d.Feather,
	})
}

func normalizeBoardBody(raw json.RawMessage) (json.RawMessage, error) {
	var evs []ctrlEvent
	if err := json.Unmarshal(raw, &evs); err != nil {
		return nil, fmt.Errorf("bad board")
	}
	if len(evs) > 64 {
		return nil, fmt.Errorf("too many events")
	}
	for i := range evs {
		evs[i].ID = clipText(evs[i].ID, 42)
		evs[i].Label = clipText(evs[i].Label, 60)
		evs[i].Anim = clipText(evs[i].Anim, 42)
		evs[i].Tune = normalizeMotionTune(evs[i].Tune)
	}
	if evs == nil {
		evs = []ctrlEvent{}
	}
	return json.Marshal(evs)
}

func (st *store) lib(key string) (libDoc, error) {
	raw, err := st.getKV(key)
	if err != nil {
		return libDoc{}, err
	}
	if raw == "" {
		return libDoc{Items: []libItem{}}, nil
	}
	var doc libDoc
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return libDoc{Items: []libItem{}}, nil
	}
	out, err := normalizeLib(key, doc)
	if err != nil {
		log.Printf("stored %s unusable (%v); ignoring", key, err)
		return libDoc{Items: []libItem{}}, nil
	}
	return out, nil
}

func (st *store) saveLib(key string, doc libDoc) (libDoc, error) {
	doc, err := normalizeLib(key, doc)
	if err != nil {
		return libDoc{}, err
	}
	b, err := json.Marshal(doc)
	if err != nil {
		return libDoc{}, err
	}
	return doc, st.setKV(key, string(b))
}

// resetLook puts the default hole and border back and leaves the effect buttons.
func resetLook(cur design) design {
	next := defaultDesign()
	if cur.Events != nil {
		next.Events = append([]ctrlEvent(nil), cur.Events...)
	} else {
		next.Events = nil
	}
	return next
}

// resetMask puts the default hole and canvas size back. Stroke, motion, and events stay.
func resetMask(cur design) design {
	src := defaultDesign()
	cur.Width, cur.Height = src.Width, src.Height
	cur.Kind = src.Kind
	cur.Points = src.Points
	cur.X, cur.Y, cur.W, cur.H, cur.R = src.X, src.Y, src.W, src.H, src.R
	cur.Feather = src.Feather
	return cur
}

// resetEvents puts the stock effect buttons back. The look stays.
func resetEvents(cur design) design {
	cur.Events = defaultDesign().Events
	return cur
}

// Ids reserved by RECIPES in web/shared.js. A custom preset cannot take one.
var builtinAnimIDs = map[string]bool{
	"none": true, "dash": true, "dash-rev": true, "dash-fast": true, "dots": true,
	"long-dash": true, "flow": true, "scan": true, "breathe": true, "heartbeat": true,
	"glow-pulse": true, "neon": true, "hue": true, "rainbow": true, "shimmer": true,
	"fire": true, "neon-swap": true, "orbit": true, "chroma": true, "comet": true, "aurora": true,
	"shockwave": true, "lightning": true,
	"pulse": true, "pulse-soft": true, "pulse-hard": true, "pulse-double": true,
	"flash": true, "flash-white": true, "flash-hot": true, "flash-cold": true, "whiteout": true,
	"alert": true, "success": true, "warn": true, "strobe": true, "blink": true, "flicker": true,
	"shake": true, "jolt": true, "swell": true, "snap": true, "wipe": true, "reverse-wipe": true,
	"rainbow-burst": true, "glitch": true, "chroma-burst": true, "spark": true, "boom": true,
}

var animEases = map[string]bool{
	"linear": true, "ease": true, "ease-in": true, "ease-out": true, "ease-in-out": true,
	"steps(1, end)": true, "steps(2, end)": true,
}

type animKey struct {
	T       float64  `json:"t"`
	Width   *float64 `json:"width,omitempty"`
	Glow    *float64 `json:"glow,omitempty"`
	Opacity *float64 `json:"opacity,omitempty"`
	Color   string   `json:"color,omitempty"`
	Offset  *float64 `json:"offset,omitempty"`
	X       *float64 `json:"x,omitempty"`
	Y       *float64 `json:"y,omitempty"`
	Rot     *float64 `json:"rot,omitempty"`
	Hue     *float64 `json:"hue,omitempty"`
}

type animFx struct {
	ID string  `json:"id"`
	Px float64 `json:"px,omitempty"`
	N  int     `json:"n,omitempty"`
}

type animRecipe struct {
	ID       string    `json:"id"`
	Label    string    `json:"label"`
	Group    string    `json:"group,omitempty"`
	Loop     bool      `json:"loop"`
	Ms       float64   `json:"ms"`
	Ease     string    `json:"ease"`
	Dash     string    `json:"dash,omitempty"`
	From     string    `json:"from,omitempty"`
	Strength float64   `json:"strength"`
	Color    string    `json:"color,omitempty"`
	Base     []animKey `json:"base,omitempty"`
	Keys     []animKey `json:"keys"`
	Fx       []animFx  `json:"fx,omitempty"`
}

type animsDoc struct {
	Custom []animRecipe `json:"custom"`
}

func normalizeMotionTune(t *motionTune) *motionTune {
	if t == nil {
		return nil
	}
	ease := t.Ease
	if !animEases[ease] {
		ease = "ease"
	}
	color := ""
	if t.Color != "" {
		color = validHex(t.Color)
	}
	return &motionTune{
		Ms: clamp(t.Ms, 100, 10000), Ease: ease, Color: color, Strength: clamp(t.Strength, 0, 4),
	}
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func clampPtr(v *float64, lo, hi float64) *float64 {
	if v == nil {
		return nil
	}
	n := clamp(*v, lo, hi)
	return &n
}

func clipText(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

func validDash(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || len(s) > 32 {
		return ""
	}
	for _, c := range s {
		if (c < '0' || c > '9') && c != ' ' && c != '.' {
			return ""
		}
	}
	return s
}

func normAnimKey(k animKey) animKey {
	k.T = clamp(k.T, 0, 1)
	k.Width = clampPtr(k.Width, 0, 8)
	k.Glow = clampPtr(k.Glow, -40, 160)
	k.Opacity = clampPtr(k.Opacity, 0, 1)
	k.Offset = clampPtr(k.Offset, -8000, 8000)
	k.X = clampPtr(k.X, -400, 400)
	k.Y = clampPtr(k.Y, -400, 400)
	k.Rot = clampPtr(k.Rot, -180, 180)
	k.Hue = clampPtr(k.Hue, 0, 3600)
	if k.Color != "" {
		k.Color = validHex(k.Color)
	}
	return k
}

func normAnimKeys(keys []animKey) []animKey {
	if len(keys) > 24 {
		keys = keys[:24]
	}
	out := make([]animKey, 0, len(keys))
	for _, k := range keys {
		out = append(out, normAnimKey(k))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].T < out[j].T })
	return out
}

func normAnimFx(fx []animFx) []animFx {
	var chroma *animFx
	var slices *animFx
	var head *animFx
	var ring *animFx
	var bolts *animFx
	var fire *animFx
	var wave *animFx
	for _, f := range fx {
		switch strings.TrimSpace(f.ID) {
		case "chroma":
			px := clamp(f.Px, 0, 80)
			if px == 0 {
				continue
			}
			n := 0
			if f.N > 0 {
				n = 1
			}
			c := animFx{ID: "chroma", Px: px, N: n}
			chroma = &c
		case "slices":
			n := f.N
			if n < 1 {
				n = 1
			}
			if n > 24 {
				n = 24
			}
			s := animFx{ID: "slices", N: n}
			slices = &s
		case "head":
			n := f.N
			if n < 1 {
				n = 1
			}
			if n > 8 {
				n = 8
			}
			h := animFx{ID: "head", N: n, Px: clamp(f.Px, 0, 400)}
			head = &h
		case "ring":
			r := animFx{ID: "ring"}
			ring = &r
		case "bolts":
			n := f.N
			if n < 1 {
				n = 1
			}
			if n > 12 {
				n = 12
			}
			b := animFx{ID: "bolts", N: n}
			bolts = &b
		case "fire":
			ff := animFx{ID: "fire"}
			fire = &ff
		case "wave":
			w := animFx{ID: "wave"}
			wave = &w
		}
	}
	out := []animFx{}
	if chroma != nil {
		out = append(out, *chroma)
	}
	if slices != nil {
		out = append(out, *slices)
	}
	if head != nil {
		out = append(out, *head)
	}
	if ring != nil {
		out = append(out, *ring)
	}
	if bolts != nil {
		out = append(out, *bolts)
	}
	if fire != nil {
		out = append(out, *fire)
	}
	if wave != nil {
		out = append(out, *wave)
	}
	return out
}

func normalizeAnims(d animsDoc) animsDoc {
	out := animsDoc{Custom: []animRecipe{}}
	seen := map[string]bool{}
	for _, r := range d.Custom {
		if len(out.Custom) >= 40 {
			break
		}
		label := clipText(r.Label, 60)
		if label == "" {
			continue
		}
		id := clipText(r.ID, 42)
		if id == "" {
			continue
		}
		if builtinAnimIDs[id] {
			id = clipText("u-"+id, 42)
		}
		if seen[id] || builtinAnimIDs[id] {
			continue
		}
		seen[id] = true
		ease := r.Ease
		if !animEases[ease] {
			ease = "ease"
		}
		group := clipText(r.Group, 24)
		if group == "" && !r.Loop {
			group = "Mine"
		}
		color := ""
		if r.Color != "" {
			color = validHex(r.Color)
		}
		keys := normAnimKeys(r.Keys)
		base := normAnimKeys(r.Base)
		fx := normAnimFx(r.Fx)
		if len(keys) == 0 && len(fx) == 0 {
			continue
		}
		out.Custom = append(out.Custom, animRecipe{
			ID: id, Label: label, Group: group, Loop: r.Loop,
			Ms: clamp(r.Ms, 100, 10000), Ease: ease, Dash: validDash(r.Dash),
			From: clipText(r.From, 42), Strength: clamp(r.Strength, 0, 4), Color: color,
			Base: base, Keys: keys, Fx: fx,
		})
	}
	return out
}

func (st *store) anims() (animsDoc, error) {
	raw, err := st.getKV("anims")
	if err != nil {
		return animsDoc{}, err
	}
	if raw == "" {
		return animsDoc{Custom: []animRecipe{}}, nil
	}
	var d animsDoc
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		return animsDoc{Custom: []animRecipe{}}, nil
	}
	return normalizeAnims(d), nil
}

func (st *store) saveAnims(d animsDoc) (animsDoc, error) {
	d = normalizeAnims(d)
	b, err := json.Marshal(d)
	if err != nil {
		return d, err
	}
	return d, st.setKV("anims", string(b))
}

func defaultDesign() design {
	// Chamfered rect in 1920x1080 — default hole. Other kinds: roundrect / circle / oval.
	const w, h, m, r = 1920.0, 1080.0, 80.0, 48.0
	return design{
		Width:       1920,
		Height:      1080,
		Kind:        "polygon",
		Stroke:      "#e6f350",
		StrokeWidth: 12,
		Glow:        8,
		Dash:        false,
		Points: []point{
			{X: m + r, Y: m}, {X: w - m - r, Y: m}, {X: w - m, Y: m + r}, {X: w - m, Y: h - m - r},
			{X: w - m - r, Y: h - m}, {X: m + r, Y: h - m}, {X: m, Y: h - m - r}, {X: m, Y: m + r},
		},
		// Same segment order as the one-shot RECIPES in web/shared.js.
		Events: []ctrlEvent{
			{ID: "pulse", Label: "Pulse", Anim: "pulse"},
			{ID: "double", Label: "Double pulse", Anim: "pulse-double"},
			{ID: "heartbeat", Label: "Heartbeat", Anim: "heartbeat"},
			{ID: "flash", Label: "Flash", Anim: "flash"},
			{ID: "rainbow", Label: "Rainbow", Anim: "rainbow-burst"},
			{ID: "boom", Label: "Boom", Anim: "boom"},
			{ID: "success", Label: "Success", Anim: "success"},
			{ID: "warn", Label: "Warn", Anim: "warn"},
			{ID: "alert", Label: "Alert", Anim: "alert"},
			{ID: "strobe", Label: "Strobe", Anim: "strobe"},
			{ID: "shake", Label: "Shake", Anim: "shake"},
			{ID: "wipe", Label: "Wipe", Anim: "wipe"},
			{ID: "spark", Label: "Spark", Anim: "spark"},
			{ID: "chroma-burst", Label: "Chroma burst", Anim: "chroma-burst"},
			{ID: "glitch", Label: "Glitch", Anim: "glitch"},
		},
	}
}

func validateDesign(d design) error {
	// Caps are far above anything the Designer makes; they only stop junk
	// payloads from bloating the db and every overlay repaint.
	if d.Width <= 0 || d.Height <= 0 || d.Width > 16384 || d.Height > 16384 {
		return fmt.Errorf("bad size")
	}
	if len(d.Points) > 512 {
		return fmt.Errorf("too many points")
	}
	if len(d.Events) > 64 {
		return fmt.Errorf("too many events")
	}
	switch d.Kind {
	case "", "polygon":
		if len(d.Points) < 3 {
			return fmt.Errorf("need at least 3 points")
		}
	case "roundrect", "circle", "oval":
		if d.W <= 0 || d.H <= 0 {
			return fmt.Errorf("bad box")
		}
	default:
		return fmt.Errorf("bad kind")
	}
	return nil
}

func ephemeralExe(dir string) bool {
	low := strings.ToLower(dir)
	return strings.Contains(low, `\temp\`) || strings.Contains(low, `/tmp/`) || strings.Contains(low, "go-build")
}

func dataDir() string {
	exe, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exe)
		// ponytail: go run parks the exe under Temp or GOCACHE; keep db next to the project
		if !ephemeralExe(dir) {
			return dir
		}
	}
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return wd
}
