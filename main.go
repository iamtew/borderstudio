package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

const addr = "127.0.0.1:8505"
const webviewDirName = "webview"

var version = "dev"
var runID = strconv.FormatInt(time.Now().UnixNano(), 10)

var (
	appMu       sync.Mutex
	wailsApp    *application.App
	designerW   *application.WebviewWindow
	controllerW *application.WebviewWindow
	aboutW      *application.WebviewWindow
)

//go:embed all:web
//go:embed assets/icon.ico
//go:embed assets/icon.png
//go:embed assets/tray
var assets embed.FS

type hub struct {
	mu    sync.Mutex
	subs  map[chan []byte]struct{}
	admin int
}

func newHub() *hub { return &hub{subs: map[chan []byte]struct{}{}} }

func (h *hub) sub() chan []byte {
	ch := make(chan []byte, 1)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *hub) unsub(ch chan []byte) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

func (h *hub) addAdmin(d int) {
	h.mu.Lock()
	h.admin += d
	if h.admin < 0 {
		h.admin = 0
	}
	h.mu.Unlock()
}

func (h *hub) hasAdmin() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.admin > 0
}

func (h *hub) broadcast(msg []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- msg:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- msg:
			default:
			}
		}
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// localOnly rejects requests that did not come from our own pages or OBS.
// Host must be our loopback address, which blocks DNS rebinding (evil.com
// resolving to 127.0.0.1 and reading /api/obs, password included). Writes
// that carry an Origin must come from that same address, which blocks any
// web page in the user's browser from POSTing /api/quit or PUT /api/design.
func localOnly(next http.Handler) http.Handler {
	_, port, _ := net.SplitHostPort(addr)
	hosts := map[string]bool{"127.0.0.1:" + port: true, "localhost:" + port: true}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hosts[r.Host] {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if o := r.Header.Get("Origin"); o != "" && !hosts[strings.TrimPrefix(o, "http://")] {
				http.Error(w, "forbidden origin", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func serveAsset(name, ctype string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if ctype != "" {
			w.Header().Set("Content-Type", ctype)
		}
		http.ServeFileFS(w, r, assets, name)
	}
}

func openURL(u string) {
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
}

func runHidden(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}

func copyText(s string) {
	if s == "" {
		return
	}
	cmd := runHidden("cmd", "/c", "clip")
	cmd.Stdin = strings.NewReader(s)
	_ = cmd.Run()
}

func overlayURL() string { return "http://" + addr + "/overlay" }

func handleVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"version": version, "run": runID})
}

func webviewPath(root string) string {
	return filepath.Join(root, webviewDirName)
}

func camPerm() map[application.PermissionType]application.Permission {
	return map[application.PermissionType]application.Permission{
		application.PermissionCamera: application.PermissionAllow,
	}
}

func showOrCreate(slot **application.WebviewWindow, opts application.WebviewWindowOptions) {
	if wailsApp == nil {
		return
	}
	appMu.Lock()
	w := *slot
	appMu.Unlock()
	if w != nil {
		w.Show()
		w.Focus()
		return
	}
	w = wailsApp.Window.NewWithOptions(opts)
	w.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		appMu.Lock()
		*slot = nil
		appMu.Unlock()
	})
	appMu.Lock()
	*slot = w
	appMu.Unlock()
}

func openDesigner() {
	showOrCreate(&designerW, application.WebviewWindowOptions{
		Title:       "Border Studio",
		Width:       1280,
		Height:      800,
		URL:         "http://" + addr + "/admin",
		Permissions: camPerm(),
	})
}

func openController() {
	showOrCreate(&controllerW, application.WebviewWindowOptions{
		Title:       "Effects",
		Width:       1280,
		Height:      800,
		URL:         "http://" + addr + "/control",
		Permissions: camPerm(),
	})
}

func openAbout() {
	showOrCreate(&aboutW, application.WebviewWindowOptions{
		Title:  "About",
		Width:  360,
		Height: 280,
		URL:    "http://" + addr + "/about",
	})
}

func closeSlot(slot **application.WebviewWindow) {
	appMu.Lock()
	w := *slot
	*slot = nil
	appMu.Unlock()
	if w != nil {
		w.Close()
	}
}

func closeDesignerWindow()   { closeSlot(&designerW) }
func closeControllerWindow() { closeSlot(&controllerW) }

func closeAppWindows() {
	closeDesignerWindow()
	closeControllerWindow()
	closeSlot(&aboutW)
}

// removeWebviewData deletes the WebView2 user-data dir under root. Missing is fine.
// ponytail: one retry after a failed delete; WebView2 can hold cache files briefly after Close.
func removeWebviewData(root string) error {
	err := os.RemoveAll(webviewPath(root))
	if err != nil {
		time.Sleep(400 * time.Millisecond)
		err = os.RemoveAll(webviewPath(root))
	}
	return err
}

func clearBrowserData() {
	closeAppWindows()
	if err := removeWebviewData(dataDir()); err != nil {
		alert("Border Studio", "Could not clear browser data: "+err.Error())
		return
	}
	trayToast("Border Studio", "Browser data cleared.")
}

func trayIcon(name string) []byte {
	b, _ := assets.ReadFile("assets/tray/" + name + ".png")
	return b
}

func trayToast(title, body string) {
	png, err := assets.ReadFile("assets/icon.png")
	if err != nil {
		return
	}
	iconPath := filepath.Join(os.TempDir(), "borderstudio-toast.png")
	if err := os.WriteFile(iconPath, png, 0644); err != nil {
		return
	}
	// PowerShell single-quoted strings escape ' as ''.
	q := func(s string) string { return strings.ReplaceAll(s, `'`, `''`) }
	psIcon, title, body := q(iconPath), q(title), q(body)
	ps := `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap '` + psIcon + `'
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$n.Visible = $true
$n.ShowBalloonTip(5000, '` + title + `', '` + body + `', [System.Windows.Forms.ToolTipIcon]::None)
Start-Sleep -Seconds 6
$n.Dispose()
$bmp.Dispose()`
	go runHidden("powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps).Run()
}

// fatal shows the error in a message box before exiting: the release build is
// -H=windowsgui, so log output goes nowhere and a plain log.Fatal looks like
// the app never started.
func fatal(err error) {
	log.Println("fatal:", err)
	alert("Border Studio", err.Error())
	os.Exit(1)
}

func main() {
	lock, err := lockInstance(instanceMutex)
	if err != nil {
		if errors.Is(err, errAlreadyRunning) {
			alert("Border Studio", "Already running.")
		} else {
			alert("Border Studio", err.Error())
		}
		return
	}
	defer syscall.CloseHandle(lock)

	st, d, err := openStore(dataDir())
	if err != nil {
		fatal(fmt.Errorf("open database in %s: %w", dataDir(), err))
	}
	defer st.close()

	var mu sync.Mutex
	obs := newObs(st, func() design {
		mu.Lock()
		defer mu.Unlock()
		return d
	})
	if cfg, err := st.obs(); err == nil && cfg.Password != "" {
		go func() { _ = obs.connect() }()
	}
	h := newHub()
	quitReq := make(chan struct{}, 1)
	requestQuit := func() {
		select {
		case quitReq <- struct{}{}:
		default:
		}
	}

	web, err := fs.Sub(assets, "web")
	if err != nil {
		fatal(err)
	}

	mux := http.NewServeMux()
	html := func(name string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFileFS(w, r, web, name)
		}
	}
	mux.HandleFunc("GET /admin", html("admin.html"))
	mux.HandleFunc("GET /control", html("admin.html"))
	mux.HandleFunc("GET /overlay", html("overlay.html"))
	mux.HandleFunc("GET /mask", html("mask.html"))
	mux.HandleFunc("GET /about", html("about.html"))
	mux.HandleFunc("GET /api/version", handleVersion)
	mux.HandleFunc("POST /api/designer/close", func(w http.ResponseWriter, r *http.Request) {
		closeDesignerWindow()
		trayToast("Border Studio", "Still running in the system tray.")
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /api/controller/close", func(w http.ResponseWriter, r *http.Request) {
		closeControllerWindow()
		trayToast("Border Studio", "Still running in the system tray.")
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /api/quit", func(w http.ResponseWriter, r *http.Request) {
		requestQuit()
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /api/help", func(w http.ResponseWriter, r *http.Request) {
		openURL("https://iamtew.github.io/borderstudio/docs.html")
		w.WriteHeader(204)
	})
	mux.HandleFunc("GET /icon.png", serveAsset("assets/icon.png", "image/png"))
	mux.HandleFunc("GET /favicon.ico", serveAsset("assets/icon.ico", "image/x-icon"))
	mux.HandleFunc("GET /api/design", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		writeJSON(w, d)
	})
	mux.HandleFunc("PUT /api/design", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
		var next design
		if err := json.NewDecoder(r.Body).Decode(&next); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if err := validateDesign(next); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		next.Feather = clamp(next.Feather, 0, 64)
		next.MotionTune = normalizeMotionTune(next.MotionTune)
		for i := range next.Events {
			next.Events[i].ID = clipText(next.Events[i].ID, 42)
			next.Events[i].Label = clipText(next.Events[i].Label, 60)
			next.Events[i].Tune = normalizeMotionTune(next.Events[i].Tune)
		}
		mu.Lock()
		prev := d
		d = next
		if err := st.save(d); err != nil {
			d = prev
			mu.Unlock()
			http.Error(w, err.Error(), 500)
			return
		}
		mu.Unlock()
		h.broadcast([]byte("update"))
		obs.schedule()
		writeJSON(w, next)
	})
	writeLive := func(w http.ResponseWriter, edit func(design) design) {
		mu.Lock()
		next := edit(d)
		prev := d
		d = next
		if err := st.save(d); err != nil {
			d = prev
			mu.Unlock()
			http.Error(w, err.Error(), 500)
			return
		}
		mu.Unlock()
		h.broadcast([]byte("update"))
		obs.schedule()
		writeJSON(w, next)
	}
	mux.HandleFunc("POST /api/design/reset", func(w http.ResponseWriter, r *http.Request) {
		writeLive(w, resetLook)
	})
	mux.HandleFunc("POST /api/design/reset-mask", func(w http.ResponseWriter, r *http.Request) {
		writeLive(w, resetMask)
	})
	mux.HandleFunc("POST /api/design/reset-events", func(w http.ResponseWriter, r *http.Request) {
		writeLive(w, resetEvents)
	})
	handleLib := func(key string) {
		mux.HandleFunc("GET /api/"+key, func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			defer mu.Unlock()
			doc, err := st.lib(key)
			if err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			writeJSON(w, doc)
		})
		mux.HandleFunc("PUT /api/"+key, func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
			var doc libDoc
			if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			mu.Lock()
			saved, err := st.saveLib(key, doc)
			mu.Unlock()
			if err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			h.broadcast([]byte("update"))
			writeJSON(w, saved)
		})
	}
	handleLib("designs")
	handleLib("masks")
	handleLib("boards")
	mux.HandleFunc("GET /api/palettes", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		doc, err := st.palettes()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, doc)
	})
	mux.HandleFunc("PUT /api/palettes", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var doc palettesDoc
		if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		saved, err := st.savePalettes(doc)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, saved)
	})
	mux.HandleFunc("GET /api/anims", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		doc, err := st.anims()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, doc)
	})
	mux.HandleFunc("PUT /api/anims", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var doc animsDoc
		if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		mu.Lock()
		saved, err := st.saveAnims(doc)
		mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		h.broadcast([]byte("update"))
		writeJSON(w, saved)
	})
	mux.HandleFunc("GET /api/obs", func(w http.ResponseWriter, r *http.Request) {
		s, err := st.obs()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, s)
	})
	mux.HandleFunc("PUT /api/obs", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var next obsSettings
		if err := json.NewDecoder(r.Body).Decode(&next); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		saved, err := st.saveObs(next)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, saved)
	})
	mux.HandleFunc("GET /api/obs/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, obs.status())
	})
	mux.HandleFunc("GET /api/obs/layout", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, obs.layout())
	})
	mux.HandleFunc("POST /api/obs/connect", func(w http.ResponseWriter, r *http.Request) {
		if err := obs.connect(); err != nil {
			http.Error(w, err.Error(), 502)
			return
		}
		writeJSON(w, obs.status())
	})
	mux.HandleFunc("POST /api/obs/disconnect", func(w http.ResponseWriter, r *http.Request) {
		obs.closeConn()
		writeJSON(w, obs.status())
	})
	mux.HandleFunc("GET /api/obs/cameras", func(w http.ResponseWriter, r *http.Request) {
		cams, err := obs.cameras()
		if err != nil {
			http.Error(w, err.Error(), 502)
			return
		}
		writeJSON(w, map[string]any{"cameras": cams})
	})
	mux.HandleFunc("GET /api/obs/devices", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimSpace(r.URL.Query().Get("input"))
		if name == "" {
			name = obsDevice
		}
		devs, err := obs.devices(name)
		if err != nil {
			http.Error(w, err.Error(), 502)
			return
		}
		writeJSON(w, map[string]any{"devices": devs})
	})
	mux.HandleFunc("PUT /api/obs/device", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var body struct {
			Input string `json:"input"`
			ID    string `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if body.Input == "" {
			body.Input = obsDevice
		}
		if strings.TrimSpace(body.ID) == "" {
			http.Error(w, "id required", 400)
			return
		}
		_, err := obs.call("SetInputSettings", map[string]any{
			"inputName": body.Input, "inputSettings": map[string]any{"video_device_id": body.ID}, "overlay": true,
		})
		if err != nil {
			http.Error(w, err.Error(), 502)
			return
		}
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /api/obs/scene", func(w http.ResponseWriter, r *http.Request) {
		if err := obs.repair(); err != nil {
			http.Error(w, err.Error(), 502)
			return
		}
		writeJSON(w, obs.status())
	})
	mux.HandleFunc("PUT /api/mode", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<10)
		var body struct {
			Mode string `json:"mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || (body.Mode != "designer" && body.Mode != "obs") {
			http.Error(w, `mode must be "designer" or "obs"`, 400)
			return
		}
		name, err := obs.camActive(body.Mode == "obs")
		if err != nil {
			http.Error(w, err.Error(), 502)
			return
		}
		writeJSON(w, map[string]string{"device": name})
	})
	mux.HandleFunc("POST /api/event", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			http.Error(w, "name required", 400)
			return
		}
		h.broadcast([]byte("event " + name))
		w.WriteHeader(204)
	})
	mux.HandleFunc("GET /api/events", func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "no flush", 500)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		admin := r.URL.Query().Has("admin")
		if admin {
			h.addAdmin(1)
			defer func() {
				h.addAdmin(-1)
				// Last admin window gone (closed or crashed): give the camera back to OBS.
				if !h.hasAdmin() {
					go obs.camActive(true)
				}
			}()
		}
		ch := h.sub()
		defer h.unsub(ch)
		fmt.Fprintf(w, "retry: 200\ndata: hello\n\n")
		fl.Flush()
		for {
			select {
			case <-r.Context().Done():
				return
			case msg := <-ch:
				fmt.Fprintf(w, "data: %s\n\n", msg)
				fl.Flush()
			}
		}
	})
	mux.Handle("/", http.FileServer(http.FS(web)))

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		fatal(fmt.Errorf("port %s is busy (another program?): %w", addr, err))
	}
	srv := &http.Server{Handler: localOnly(mux), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Println("listening", addr)
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			fatal(err)
		}
	}()
	wvDir := webviewPath(dataDir())
	if err := os.MkdirAll(wvDir, 0755); err != nil {
		fatal(fmt.Errorf("webview data dir %s: %w", wvDir, err))
	}

	png, _ := assets.ReadFile("assets/icon.png")
	wailsApp = application.New(application.Options{
		Name: "Border Studio",
		Icon: png,
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: true,
			WebviewUserDataPath:           wvDir,
		},
	})
	tray := wailsApp.SystemTray.New()
	tray.SetIcon(png)
	tray.SetTooltip("Border Studio")
	menu := wailsApp.Menu.New()
	menu.Add("Designer").SetBitmap(trayIcon("pencil")).OnClick(func(_ *application.Context) { openDesigner() })
	menu.Add("Effects").SetBitmap(trayIcon("sparkles")).OnClick(func(_ *application.Context) { openController() })
	menu.Add("Overlay").SetBitmap(trayIcon("border-corners")).OnClick(func(_ *application.Context) { openURL(overlayURL()) })
	menu.Add("Copy URL").SetBitmap(trayIcon("copy")).OnClick(func(_ *application.Context) { copyText(overlayURL()) })
	menu.AddSeparator()
	menu.Add("Clear browser data").SetBitmap(trayIcon("browser-x")).OnClick(func(_ *application.Context) {
		if !confirm("Border Studio", "Close Designer, Effects, and About and delete saved WebView data?") {
			return
		}
		clearBrowserData()
	})
	menu.Add("About").SetBitmap(trayIcon("info-circle")).OnClick(func(_ *application.Context) { openAbout() })
	menu.Add("Quit").SetBitmap(trayIcon("power")).OnClick(func(_ *application.Context) {
		closeAppWindows()
		_ = srv.Close()
		wailsApp.Quit()
	})
	tray.SetMenu(menu)

	go func() {
		<-quitReq
		closeAppWindows()
		_ = srv.Close()
		wailsApp.Quit()
	}()
	wailsApp.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(_ *application.ApplicationEvent) {
		openDesigner()
	})

	if err := wailsApp.Run(); err != nil {
		fatal(err)
	}
}
