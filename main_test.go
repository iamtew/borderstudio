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
