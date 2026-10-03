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

	"github.com/getlantern/systray"
)

const addr = "127.0.0.1:8505"

var version = "dev"
var runID = strconv.FormatInt(time.Now().UnixNano(), 10)

var (
	appMu      sync.Mutex
	designer   *exec.Cmd
	controller *exec.Cmd
	about      *exec.Cmd
)

//go:embed all:web
//go:embed assets/icon.ico
//go:embed assets/icon.png
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

func browserPath() string {
	for _, p := range []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("LocalAppData"), `Google\Chrome\Application\chrome.exe`),
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func openApp(u, size string, extra ...string) *exec.Cmd {
	p := browserPath()
	if p == "" {
		openURL(u)
		return nil
	}
	args := append(append([]string{}, extra...), "--window-size="+size, "--new-window", "--app="+u)
	cmd := exec.Command(p, args...)
	if err := cmd.Start(); err != nil {
		openURL(u)
		return nil
	}
	go cmd.Wait()
	return cmd
}

func processAlive(cmd *exec.Cmd) bool {
	return cmd != nil && cmd.Process != nil && cmd.ProcessState == nil
}

func openChrome(slot **exec.Cmd, profile, path, size string) {
	appMu.Lock()
	defer appMu.Unlock()
	if processAlive(*slot) {
		return
	}
	dir := filepath.Join(dataDir(), profile)
	_ = os.MkdirAll(dir, 0755)
	// ponytail: isolated profile so Kill on quit does not take down the user's Edge/Chrome
	*slot = openApp("http://"+addr+path, size, "--user-data-dir="+dir)
}

func openDesigner() {
	openChrome(&designer, "designer-chrome", "/admin", "1280,800")
}

func openController() {
	openChrome(&controller, "controller-chrome", "/control", "1280,800")
}

func openAbout() {
	openChrome(&about, "about-chrome", "/about", "360,280")
}

func killTree(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = runHidden("taskkill", "/F", "/T", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
}

func killProfile(name string) {
	// ponytail: Chromium window is a child; Kill() on the launcher PID leaves it up
	_ = runHidden("wmic", "process", "where", "CommandLine like '%"+name+"%'", "delete").Run()
}

func closeDesignerWindow() {
	appMu.Lock()
	defer appMu.Unlock()
	killTree(designer)
	killProfile("designer-chrome")
	designer = nil
}

func closeControllerWindow() {
	appMu.Lock()
	defer appMu.Unlock()
	killTree(controller)
	killProfile("controller-chrome")
	controller = nil
}

func closeAppWindows() {
	appMu.Lock()
	defer appMu.Unlock()
	killTree(designer)
	killTree(controller)
	killTree(about)
	killProfile("designer-chrome")
	killProfile("controller-chrome")
	killProfile("about-chrome")
	designer, controller, about = nil, nil, nil
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
	psIcon := strings.ReplaceAll(iconPath, `'`, `''`)
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
		log.Fatal(err)
	}
	defer st.close()

	var mu sync.Mutex
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
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web, "admin.html")
	})
	mux.HandleFunc("GET /control", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web, "admin.html")
	})
	mux.HandleFunc("GET /overlay", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web, "overlay.html")
	})
	mux.HandleFunc("GET /about", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, web, "about.html")
	})
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
		next.MotionTune = normalizeMotionTune(next.MotionTune)
		for i := range next.Events {
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
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /api/design/reset", func(w http.ResponseWriter, r *http.Request) {
		next := defaultDesign()
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
		writeJSON(w, next)
	})
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
			defer h.addAdmin(-1)
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
		log.Fatal(err)
	}
	srv := &http.Server{Handler: mux}
	go func() {
		log.Println("listening", addr)
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	go func() {
		// ponytail: wait for an existing admin EventSource to reconnect; open Designer if none does
		time.Sleep(500 * time.Millisecond)
		if !h.hasAdmin() {
			openDesigner()
		}
	}()

	systray.Run(func() {
		ico, _ := assets.ReadFile("assets/icon.ico")
		systray.SetIcon(ico)
		systray.SetTitle("Border Studio")
		systray.SetTooltip("Border Studio")
		admin := systray.AddMenuItem("Designer", "Open Border Studio Designer")
		ctrl := systray.AddMenuItem("Controller", "Open Controller")
		overlay := systray.AddMenuItem("Overlay", "Open overlay")
		copyOverlay := systray.AddMenuItem("Copy URL", "Copy overlay URL")
		systray.AddSeparator()
		aboutItem := systray.AddMenuItem("About", "About Border Studio")
		quit := systray.AddMenuItem("Quit", "Quit")
		go func() {
			doQuit := func() {
				closeAppWindows()
				_ = srv.Close()
				systray.Quit()
			}
			for {
				select {
				case <-admin.ClickedCh:
					openDesigner()
				case <-ctrl.ClickedCh:
					openController()
				case <-overlay.ClickedCh:
					openURL(overlayURL())
				case <-copyOverlay.ClickedCh:
					copyText(overlayURL())
				case <-aboutItem.ClickedCh:
					openAbout()
				case <-quit.ClickedCh:
					doQuit()
					return
				case <-quitReq:
					doQuit()
					return
				}
			}
		}()
	}, func() {})
}
