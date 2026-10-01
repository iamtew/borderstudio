package main

import "testing"

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
}

func TestValidateDesign(t *testing.T) {
	if err := validateDesign(design{Width: 10, Height: 10, Points: []point{{0, 0}, {1, 0}}}); err == nil {
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
