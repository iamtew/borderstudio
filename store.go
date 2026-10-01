package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

type point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type ctrlEvent struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Anim  string `json:"anim"` // named one-shot from overlay catalog
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
	Dash        bool        `json:"dash"`
	Motion      string      `json:"motion,omitempty"`
	Events      []ctrlEvent `json:"events"`
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
	db, err := sql.Open("sqlite", filepath.Join(dir, "border.db"))
	if err != nil {
		return nil, design{}, err
	}
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
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		return design{}, err
	}
	if err := validateDesign(d); err != nil {
		return design{}, err
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
			{m + r, m}, {w - m - r, m}, {w - m, m + r}, {w - m, h - m - r},
			{w - m - r, h - m}, {m + r, h - m}, {m, h - m - r}, {m, m + r},
		},
		Events: []ctrlEvent{
			{ID: "pulse", Label: "Pulse", Anim: "pulse"},
			{ID: "flash", Label: "Flash", Anim: "flash"},
			{ID: "double", Label: "Double pulse", Anim: "pulse-double"},
			{ID: "heartbeat", Label: "Heartbeat", Anim: "heartbeat"},
			{ID: "strobe", Label: "Strobe", Anim: "strobe"},
			{ID: "alert", Label: "Alert", Anim: "alert"},
			{ID: "success", Label: "Success", Anim: "success"},
			{ID: "warn", Label: "Warn", Anim: "warn"},
			{ID: "shake", Label: "Shake", Anim: "shake"},
			{ID: "wipe", Label: "Wipe", Anim: "wipe"},
			{ID: "rainbow", Label: "Rainbow", Anim: "rainbow-burst"},
			{ID: "glitch", Label: "Glitch", Anim: "glitch"},
			{ID: "spark", Label: "Spark", Anim: "spark"},
			{ID: "boom", Label: "Boom", Anim: "boom"},
		},
	}
}

func validateDesign(d design) error {
	if d.Width <= 0 || d.Height <= 0 {
		return fmt.Errorf("bad size")
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

func dataDir() string {
	exe, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exe)
		low := strings.ToLower(dir)
		// ponytail: go run parks the exe under Temp; keep db next to the project instead
		if !strings.Contains(low, `\temp\`) && !strings.Contains(low, `/tmp/`) {
			return dir
		}
	}
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return wd
}
