package main

import (
	"encoding/json"
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
		"OBS Virtual Camera":                                 "OBS Virtual Camera",
		"":                                                   "",
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
	if err := st.save(d); err != nil {
		t.Fatal(err)
	}
	got, err := st.load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Stroke != "#FF00FF" || len(got.Points) != len(d.Points) {
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
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Custom) != 1 {
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
	if len(again.Custom) != 1 || again.Custom[0].ID != "u-pulse" {
		t.Fatalf("reload %+v", again)
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
	if got.Host != "127.0.0.1" || got.Port != 4455 {
		t.Fatalf("default %+v", got)
	}
	saved, err := st.saveObs(obsSettings{Host: " 10.0.0.2 ", Port: 0, Password: "x", Camera: " Cam "})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Host != "10.0.0.2" || saved.Port != 4455 || saved.Camera != "Cam" {
		t.Fatalf("saved %+v", saved)
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
	if kept.Camera != "Cam" || kept.Password != "y" {
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
