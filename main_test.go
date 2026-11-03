package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultDesign(t *testing.T) {
	d := defaultDesign()
	if err := validateDesign(d); err != nil {
		t.Fatal(err)
	}
	if len(d.Points) < 3 {
		t.Fatalf("need closed polygon, got %d points", len(d.Points))
	}
	// Closed in the renderer (pathD adds Z / canvas closePath). Mask is nonzero fill.
	if d.Width != 1920 || d.Height != 1080 {
		t.Fatalf("default canvas %dx%d", d.Width, d.Height)
	}
	if len(d.Events) < 10 {
		t.Fatalf("packed default events, got %d", len(d.Events))
	}
}

func TestDeviceName(t *testing.T) {
	for in, want := range map[string]string{
		`Logitech BRIO:\\?\usb#vid_046d&pid_085e#{65e8773d}`: "Logitech BRIO",
		"OBS Virtual Camera": "OBS Virtual Camera",
		"":                   "",
	} {
		if got := deviceName(in); got != want {
			t.Errorf("deviceName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidateDesign(t *testing.T) {
	if err := validateDesign(design{Width: 10, Height: 10, Points: []point{{X: 0, Y: 0}, {X: 1, Y: 0}}}); err == nil {
		t.Fatal("expected error for 2 points")
	}
	if err := validateDesign(design{Width: 10, Height: 10, Kind: "circle", W: 8, H: 8}); err != nil {
		t.Fatal(err)
	}
	if err := validateDesign(design{Width: 10, Height: 10, Kind: "oval"}); err == nil {
		t.Fatal("expected error for empty oval")
	}
}

func TestStoreRoundtrip(t *testing.T) {
	st, d, err := openStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.close()
	d.Stroke = "#FF00FF"
	d.InnerStroke = "#333333"
	d.InnerStrokeWidth = 18
	d.InnerBlur = 6
	if err := st.save(d); err != nil {
		t.Fatal(err)
	}
	got, err := st.load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Stroke != "#FF00FF" || got.InnerStroke != "#333333" || got.InnerStrokeWidth != 18 || got.InnerBlur != 6 || len(got.Points) != len(d.Points) {
		t.Fatalf("roundtrip %+v", got)
	}
	d.Motion = "rainbow"
	d.Dash = true
	if err := st.save(d); err != nil {
		t.Fatal(err)
	}
	got, err = st.load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Motion != "rainbow" || !got.Dash {
		t.Fatalf("motion roundtrip %+v", got)
	}
	d.MotionTune = &motionTune{Ms: 50, Ease: "nope", Color: "ff00ff", Strength: 9}
	if err := st.save(d); err != nil {
		t.Fatal(err)
	}
	got, err = st.load()
	if err != nil {
		t.Fatal(err)
	}
	if got.MotionTune == nil || got.MotionTune.Ms != 100 || got.MotionTune.Ease != "ease" || got.MotionTune.Color != "#ff00ff" || got.MotionTune.Strength != 4 {
		t.Fatalf("tune %+v", got.MotionTune)
	}
	d.Events[0].Tune = &motionTune{Ms: 40, Ease: "linear", Color: "00ff00", Strength: 1}
	if err := st.save(d); err != nil {
		t.Fatal(err)
	}
	got, err = st.load()
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Events) == 0 || got.Events[0].Tune == nil || got.Events[0].Tune.Ms != 100 || got.Events[0].Tune.Color != "#00ff00" {
		t.Fatalf("event tune %+v", got.Events)
	}
	if err := st.save(defaultDesign()); err != nil {
		t.Fatal(err)
	}
	got, err = st.load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Stroke != defaultDesign().Stroke {
		t.Fatalf("reset %+v", got)
	}
}

func TestPalettesRoundtrip(t *testing.T) {
	st, _, err := openStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.close()
	got, err := st.palettes()
	if err != nil {
		t.Fatal(err)
	}
	if got.Selected != "basic" || len(got.Custom) != 0 {
		t.Fatalf("default %+v", got)
	}
	saved, err := st.savePalettes(palettesDoc{
		Selected: "neon",
		Custom: []colorPalette{
			{ID: "p1", Name: " Sofa ", Colors: []string{"#9AAC62", "not-hex", "ff00ff"}},
			{Name: "", Colors: []string{"#fff"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Selected != "neon" || len(saved.Custom) != 1 {
		t.Fatalf("saved %+v", saved)
	}
	if saved.Custom[0].Name != "Sofa" || len(saved.Custom[0].Colors) != 2 {
		t.Fatalf("custom %+v", saved.Custom[0])
	}
	if saved.Custom[0].Colors[0] != "#9AAC62" || saved.Custom[0].Colors[1] != "#ff00ff" {
		t.Fatalf("hex %+v", saved.Custom[0].Colors)
	}
	again, err := st.palettes()
	if err != nil {
		t.Fatal(err)
	}
	if again.Selected != "neon" || again.Custom[0].ID != "p1" {
		t.Fatalf("reload %+v", again)
	}
}

func TestAnimsRoundtrip(t *testing.T) {
	st, _, err := openStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.close()
	got, err := st.anims()
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Custom) != 0 {
		t.Fatalf("default %+v", got)
	}
	w := 1.8
	glow := 16.0
	pxTooBig := 100.0
	saved, err := st.saveAnims(animsDoc{Custom: []animRecipe{
		{
			ID: "pulse", Label: " Hot copy ", Ms: 50, Ease: "nope", Color: "ff00ff", Strength: 9,
			Keys: []animKey{{T: 2, Width: &w, Glow: &glow, Color: "not-a-color"}},
			Fx:   []animFx{{ID: "explode", Px: 4}, {ID: "chroma", Px: pxTooBig}},
		},
		{ID: "mine", Label: "", Ms: 400, Keys: []animKey{{T: 0}}},
		{
			ID: "fxkeep", Label: "Keep", Ms: 400,
			Keys: []animKey{{T: 0}},
			Fx: []animFx{
				{ID: "explode", Px: 4},
				{ID: "chroma", Px: 3, N: 2},
				{ID: "head", N: 2, Px: 40},
				{ID: "ring"},
				{ID: "bolts", N: 4},
				{ID: "slices", N: 5},
				{ID: "fire"},
				{ID: "wave"},
			},
		},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Custom) != 2 {
		t.Fatalf("saved %+v", saved.Custom)
	}
	r := saved.Custom[0]
	if r.ID == "pulse" || builtinAnimIDs[r.ID] {
		t.Fatalf("builtin id leaked %q", r.ID)
	}
	if r.ID != "u-pulse" || r.Label != "Hot copy" || r.Ms != 100 || r.Ease != "ease" {
		t.Fatalf("norm %+v", r)
	}
	if r.Color != "#ff00ff" || r.Strength != 4 || r.Keys[0].T != 1 || r.Keys[0].Color != "" {
		t.Fatalf("fields %+v", r)
	}
	if len(r.Fx) != 1 || r.Fx[0].ID != "chroma" || r.Fx[0].Px != 80 {
		t.Fatalf("fx %+v", r.Fx)
	}
	again, err := st.anims()
	if err != nil {
		t.Fatal(err)
	}
	if len(again.Custom) != 2 || again.Custom[0].ID != "u-pulse" {
		t.Fatalf("reload %+v", again)
	}
	keep := again.Custom[1]
	if keep.ID != "fxkeep" || len(keep.Fx) != 7 {
		t.Fatalf("fx keep %+v", keep.Fx)
	}
	if keep.Fx[0].ID != "chroma" || keep.Fx[0].N != 1 || keep.Fx[0].Px != 3 {
		t.Fatalf("chroma %+v", keep.Fx[0])
	}
	if keep.Fx[1].ID != "slices" || keep.Fx[1].N != 5 || keep.Fx[2].ID != "head" || keep.Fx[2].N != 2 || keep.Fx[2].Px != 40 {
		t.Fatalf("fx %+v", keep.Fx)
	}
	if keep.Fx[3].ID != "ring" || keep.Fx[4].ID != "bolts" || keep.Fx[4].N != 4 {
		t.Fatalf("fx tail %+v", keep.Fx)
	}
	if keep.Fx[5].ID != "fire" || keep.Fx[6].ID != "wave" {
		t.Fatalf("fx mode %+v", keep.Fx)
	}
}

func TestSmoothPointRoundTrip(t *testing.T) {
	p := point{X: 10, Y: 20, Smooth: true, Ix: 0, Iy: 14, Ox: 18, Oy: 20}
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var q point
	if err := json.Unmarshal(b, &q); err != nil {
		t.Fatal(err)
	}
	if !q.Smooth || q.Ix != 0 || q.Iy != 14 || q.Ox != 18 || q.Oy != 20 {
		t.Fatalf("handles dropped: %+v from %s", q, b)
	}
	corner := point{X: 1, Y: 2}
	b, _ = json.Marshal(corner)
	if strings.Contains(string(b), "smooth") {
		t.Fatalf("corner grew handles: %s", b)
	}
}

func TestOverlayPad(t *testing.T) {
	d := defaultDesign()
	p := overlayPad(d)
	want := 57 // ceil(12*1.3 + 8 + 0 + 28 + 5)
	if p != want {
		t.Fatalf("pad %d want %d", p, want)
	}
	lay := obsLayout(d, 1920, 1080)
	if lay.OverlayW != 1920 || lay.OverlayH != 1080 {
		t.Fatalf("overlay %+v", lay)
	}
	if lay.CameraH != 1080-2*p {
		t.Fatalf("camera should fill tight axis %+v pad %d", lay, p)
	}
	if lay.CameraW >= 1920 || lay.PadX+lay.CameraW+lay.PadX > 1920 {
		t.Fatalf("camera wider than canvas %+v", lay)
	}
}

func TestObsSettingsRoundtrip(t *testing.T) {
	st, _, err := openStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.close()
	got, err := st.obs()
	if err != nil {
		t.Fatal(err)
	}
	if got.Host != "127.0.0.1" || got.Port != 4455 || got.DefaultMode != "obs" || !got.AutoOffline || !got.AutoOnline || got.ModeGraceSec != 0 {
		t.Fatalf("default %+v", got)
	}
	saved, err := st.saveObs(obsSettings{Host: " 10.0.0.2 ", Port: 0, Password: "x", Camera: " Cam "})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Host != "10.0.0.2" || saved.Port != 4455 || saved.Camera != "Cam" || !saved.AutoOffline {
		t.Fatalf("saved %+v", saved)
	}
	modes, err := st.saveObs(obsSettings{Host: "10.0.0.2", Port: 4455, Password: "x", Camera: "Cam", DefaultMode: "designer", AutoOffline: false, AutoOnline: true, ModeGraceSec: 5})
	if err != nil {
		t.Fatal(err)
	}
	if modes.DefaultMode != "designer" || modes.AutoOffline || !modes.AutoOnline || modes.ModeGraceSec != 5 {
		t.Fatalf("mode prefs %+v", modes)
	}
	again, err := st.obs()
	if err != nil {
		t.Fatal(err)
	}
	if again.Password != "x" || again.Camera != "Cam" {
		t.Fatalf("reload %+v", again)
	}
	kept, err := st.saveObs(obsSettings{Host: "10.0.0.2", Port: 4455, Password: "y", Camera: ""})
	if err != nil {
		t.Fatal(err)
	}
	if kept.Camera != "Cam" || kept.Password != "y" || kept.DefaultMode != "designer" {
		t.Fatalf("empty camera clobber %+v", kept)
	}
}

func TestEphemeralExe(t *testing.T) {
	if !ephemeralExe(`C:\Users\x\AppData\Local\Temp\go-build123`) {
		t.Fatal("temp")
	}
	if !ephemeralExe(`C:\Users\x\AppData\Local\go-build\ab\exe`) {
		t.Fatal("go-build")
	}
	if !ephemeralExe(`/tmp/go-build123`) {
		t.Fatal("tmp")
	}
	if ephemeralExe(`F:\src\borderstudio\dist`) {
		t.Fatal("dist is not ephemeral")
	}
}

func TestLoadBadDesignFallsBack(t *testing.T) {
	dir := t.TempDir()
	st, _, err := openStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := st.setKV("design", "{not json"); err != nil {
		t.Fatal(err)
	}
	st.close()
	st, d, err := openStore(dir)
	if err != nil {
		t.Fatalf("corrupt design bricked startup: %v", err)
	}
	defer st.close()
	if d.Stroke != defaultDesign().Stroke {
		t.Fatalf("want default design, got %+v", d)
	}
	if bad, _ := st.getKV("design.bad"); bad != "{not json" {
		t.Fatalf("bad row not kept: %q", bad)
	}
}

func TestValidateDesignCaps(t *testing.T) {
	tri := []point{{X: 0, Y: 0}, {X: 1, Y: 0}, {X: 1, Y: 1}}
	for name, d := range map[string]design{
		"width":  {Width: 20000, Height: 10, Points: tri},
		"points": {Width: 10, Height: 10, Points: make([]point, 513)},
		"events": {Width: 10, Height: 10, Points: tri, Events: make([]ctrlEvent, 65)},
	} {
		if validateDesign(d) == nil {
			t.Errorf("%s: expected cap error", name)
		}
	}
}

func TestHostGuard(t *testing.T) {
	h := localOnly(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	for _, c := range []struct {
		method, host, origin string
		want                 int
	}{
		{"GET", "127.0.0.1:8505", "", 204},
		{"POST", "localhost:8505", "http://127.0.0.1:8505", 204},
		{"POST", "127.0.0.1:8505", "", 204},
		{"GET", "evil.com:8505", "", 403},
		{"POST", "127.0.0.1:8505", "https://evil.com", 403},
	} {
		r := httptest.NewRequest(c.method, "/api/quit", nil)
		r.Host = c.host
		if c.origin != "" {
			r.Header.Set("Origin", c.origin)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != c.want {
			t.Errorf("%s host=%s origin=%s: got %d want %d", c.method, c.host, c.origin, w.Code, c.want)
		}
	}
}

func TestRemoveWebviewData(t *testing.T) {
	root := t.TempDir()
	keep := filepath.Join(root, "border.db")
	if err := os.WriteFile(keep, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	dir := webviewPath(root)
	if err := os.Mkdir(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "Preferences"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := removeWebviewData(root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("webview still there: %v", err)
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatal(err)
	}
}

func TestLibsAndReset(t *testing.T) {
	st, _, err := openStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.close()
	for _, key := range []string{"designs", "masks", "boards"} {
		doc, err := st.lib(key)
		if err != nil {
			t.Fatal(err)
		}
		if doc.Selected != "" || len(doc.Items) != 0 {
			t.Fatalf("empty %s %+v", key, doc)
		}
	}
	look := defaultDesign()
	look.Stroke = "#ffffff"
	look.Events = []ctrlEvent{{ID: "nope", Label: "X", Anim: "pulse"}}
	raw, err := json.Marshal(look)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := st.saveLib("designs", libDoc{
		Selected: "missing",
		Items: []libItem{
			{Name: "  Mine  ", Body: raw},
			{Name: "   ", Body: raw},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Selected != "" || len(saved.Items) != 1 || saved.Items[0].Name != "Mine" || saved.Items[0].ID == "" {
		t.Fatalf("design lib %+v", saved)
	}
	if strings.Contains(string(saved.Items[0].Body), `"events"`) {
		t.Fatalf("design body kept events: %s", saved.Items[0].Body)
	}
	if _, err := st.saveLib("designs", libDoc{Items: []libItem{{Name: "Bad", Body: []byte(`{"width":10,"height":10}`)}}}); err == nil {
		t.Fatal("bad design accepted")
	}
	kept, err := st.lib("designs")
	if err != nil || len(kept.Items) != 1 || kept.Items[0].Name != "Mine" {
		t.Fatalf("bad save changed library: %+v %v", kept, err)
	}
	if _, err := st.saveLib("masks", libDoc{Items: []libItem{{Name: "Bad", Body: []byte(`{"width":10,"height":10,"kind":"polygon"}`)}}}); err == nil {
		t.Fatal("bad mask accepted")
	}
	maskRaw, err := json.Marshal(defaultDesign())
	if err != nil {
		t.Fatal(err)
	}
	masks, err := st.saveLib("masks", libDoc{Items: []libItem{{ID: "hole", Name: "Hole", Body: maskRaw}}})
	if err != nil {
		t.Fatal(err)
	}
	if masks.Items[0].ID != "hole" || strings.Contains(string(masks.Items[0].Body), "stroke") {
		t.Fatalf("mask body %+v", string(masks.Items[0].Body))
	}
	longID := strings.Repeat("a", 80)
	boardRaw, err := json.Marshal([]ctrlEvent{{ID: longID, Label: " Hi ", Anim: "pulse", Tune: &motionTune{Ms: 40, Ease: "linear", Color: "00ff00", Strength: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	boards, err := st.saveLib("boards", libDoc{Items: []libItem{{Name: "Show", Body: boardRaw}}})
	if err != nil {
		t.Fatal(err)
	}
	var evs []ctrlEvent
	if err := json.Unmarshal(boards.Items[0].Body, &evs); err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 || len(evs[0].ID) != 42 || evs[0].Label != "Hi" || evs[0].Tune == nil || evs[0].Tune.Ms != 100 {
		t.Fatalf("board %+v", evs)
	}
	tooMany := make([]ctrlEvent, 65)
	tooRaw, _ := json.Marshal(tooMany)
	if _, err := st.saveLib("boards", libDoc{Items: []libItem{{Name: "Too", Body: tooRaw}}}); err == nil {
		t.Fatal("65 events accepted")
	}

	cur := defaultDesign()
	cur.Stroke = "#112233"
	cur.Events = []ctrlEvent{{ID: "keep", Label: "Keep", Anim: "pulse"}}
	lookOnly := resetLook(cur)
	if lookOnly.Stroke != defaultDesign().Stroke || len(lookOnly.Events) != 1 || lookOnly.Events[0].ID != "keep" {
		t.Fatalf("reset look %+v", lookOnly)
	}
	holeOnly := resetMask(cur)
	if holeOnly.Stroke != "#112233" || holeOnly.Events[0].ID != "keep" || holeOnly.Width != 1920 {
		t.Fatalf("reset mask %+v", holeOnly)
	}
	evOnly := resetEvents(cur)
	if evOnly.Stroke != "#112233" || len(evOnly.Events) < 10 || evOnly.Events[0].ID == "keep" {
		t.Fatalf("reset events %+v", evOnly.Events)
	}
}

func TestDashJSONStillLoads(t *testing.T) {
	raw := `{"width":10,"height":10,"points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}],"dash":true}`
	var d design
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		t.Fatal(err)
	}
	if !d.Dash || d.Motion != "" {
		t.Fatalf("dash compat %+v", d)
	}
}

func TestClampFxBtn(t *testing.T) {
	if clampFxBtn("") != fxBtnColors[0] {
		t.Fatal("empty")
	}
	if clampFxBtn("#ff00ff") != fxBtnColors[0] {
		t.Fatal("neon")
	}
	want := fxBtnColors[3]
	if clampFxBtn(strings.ToUpper(want)) != want {
		t.Fatal("case")
	}
	if len(fxBtnColors) != 30 {
		t.Fatalf("palette %d", len(fxBtnColors))
	}
	last := fxBtnColors[len(fxBtnColors)-1]
	if clampFxBtn(last) != last {
		t.Fatal("expanded")
	}
}

func TestFireGET(t *testing.T) {
	h := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /fx/{id}", func(w http.ResponseWriter, r *http.Request) {
		writeFire(h, w, r.PathValue("id"))
	})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/fx/pulse", nil))
	if w.Code != 204 {
		t.Fatalf("got %d", w.Code)
	}
	w = httptest.NewRecorder()
	writeFire(h, w, "  ")
	if w.Code != 400 {
		t.Fatalf("empty got %d", w.Code)
	}
}
