package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const (
	obsScene   = "Border Studio"
	obsWrap    = "BS Camera"
	obsMask    = "BS Mask"
	obsOverlay = "BS Overlay"
	obsDevice  = "BS Camera Device"
	obsFilter  = "Advanced Mask"
	obsKindVCD = "dshow_input"
	obsKindWeb = "browser_source"
	obsKindAM  = "advanced_masks_filter"
)

type obsSettings struct {
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Password     string `json:"password"`
	Camera       string `json:"camera"`
	DefaultMode  string `json:"defaultMode"`
	AutoOffline  bool   `json:"autoOffline"`
	AutoOnline   bool   `json:"autoOnline"`
	ModeGraceSec int    `json:"modeGraceSec"`
}

type obsLayoutDoc struct {
	Pad      int `json:"pad"`
	PadX     int `json:"padX"`
	PadY     int `json:"padY"`
	CameraW  int `json:"cameraW"`
	CameraH  int `json:"cameraH"`
	OverlayW int `json:"overlayW"`
	OverlayH int `json:"overlayH"`
}

type obsCam struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}

type obsWebcam struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type obsClient struct {
	st     *store
	design func() design
	mu     sync.Mutex
	conn   *obsConn
	err    string
	timer  *time.Timer
	want   bool        // user asked to be connected; cleared by Disconnect
	retry  *time.Timer // pending auto-reconnect
}

type obsConn struct {
	ws      *websocket.Conn
	pending map[string]chan obsReply
	mu      sync.Mutex
	id      atomic.Uint64
}

type obsReply struct {
	ok   bool
	msg  string
	data json.RawMessage
}

type obsWire struct {
	Op int             `json:"op"`
	D  json.RawMessage `json:"d"`
}

func overlayPad(d design) int {
	sw := d.StrokeWidth
	if sw < 1 {
		sw = 1
	}
	n := sw*1.3 + d.Glow + d.Blur + 28 + 5
	p := int(n)
	if float64(p) < n {
		p++
	}
	if p < 1 {
		return 1
	}
	return p
}

func obsLayout(d design, canvasW, canvasH int) obsLayoutDoc {
	if canvasW <= 0 {
		canvasW = 1920
	}
	if canvasH <= 0 {
		canvasH = 1080
	}
	p := overlayPad(d)
	maxW := canvasW - 2*p
	maxH := canvasH - 2*p
	if maxW < 16 {
		maxW = 16
	}
	if maxH < 16 {
		maxH = 16
	}
	dw, dh := float64(d.Width), float64(d.Height)
	if dw < 1 {
		dw = 1
	}
	if dh < 1 {
		dh = 1
	}
	s := math.Min(float64(maxW)/dw, float64(maxH)/dh)
	camW := int(math.Floor(dw * s))
	camH := int(math.Floor(dh * s))
	if camW < 16 {
		camW = 16
	}
	if camH < 16 {
		camH = 16
	}
	return obsLayoutDoc{
		Pad: p, PadX: (canvasW - camW) / 2, PadY: (canvasH - camH) / 2,
		CameraW: camW, CameraH: camH, OverlayW: canvasW, OverlayH: canvasH,
	}
}

func obsAuth(password, salt, challenge string) string {
	s1 := sha256.Sum256([]byte(password + salt))
	secret := base64.StdEncoding.EncodeToString(s1[:])
	s2 := sha256.Sum256([]byte(secret + challenge))
	return base64.StdEncoding.EncodeToString(s2[:])
}

func normalizeObs(s obsSettings) obsSettings {
	s.Host = strings.TrimSpace(s.Host)
	if s.Host == "" {
		s.Host = "127.0.0.1"
	}
	if s.Port <= 0 || s.Port > 65535 {
		s.Port = 4455
	}
	s.Camera = strings.TrimSpace(s.Camera)
	if s.DefaultMode == "" {
		s.DefaultMode = "obs"
		s.AutoOffline = true
		s.AutoOnline = true
	} else if s.DefaultMode != "designer" {
		s.DefaultMode = "obs"
	}
	if s.ModeGraceSec < 0 {
		s.ModeGraceSec = 0
	}
	return s
}

func (st *store) obs() (obsSettings, error) {
	raw, err := st.getKV("obs")
	if err != nil {
		return obsSettings{}, err
	}
	if raw == "" {
		return normalizeObs(obsSettings{}), nil
	}
	var s obsSettings
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return normalizeObs(obsSettings{}), nil
	}
	return normalizeObs(s), nil
}

func (st *store) saveObs(s obsSettings) (obsSettings, error) {
	if prev, err := st.obs(); err == nil {
		if s.Camera == "" {
			s.Camera = prev.Camera
		}
		if s.DefaultMode == "" {
			s.DefaultMode = prev.DefaultMode
			s.AutoOffline = prev.AutoOffline
			s.AutoOnline = prev.AutoOnline
			s.ModeGraceSec = prev.ModeGraceSec
		}
	}
	s = normalizeObs(s)
	b, err := json.Marshal(s)
	if err != nil {
		return s, err
	}
	return s, st.setKV("obs", string(b))
}

func newObs(st *store, design func() design) *obsClient {
	return &obsClient{st: st, design: design}
}

func (o *obsClient) status() map[string]any {
	o.mu.Lock()
	defer o.mu.Unlock()
	return map[string]any{"connected": o.conn != nil, "error": o.err}
}

func (o *obsClient) connected() bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.conn != nil
}

func (o *obsClient) closeConn() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.want = false
	if o.retry != nil {
		o.retry.Stop()
	}
	if o.conn != nil {
		_ = o.conn.ws.Close(websocket.StatusNormalClosure, "")
		o.conn = nil
	}
}

func (o *obsClient) connect() error {
	cfg, err := o.st.obs()
	if err != nil {
		return err
	}
	o.mu.Lock()
	o.want = true
	o.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	c, err := dialObs(ctx, cfg)
	o.mu.Lock()
	if o.conn != nil {
		_ = o.conn.ws.Close(websocket.StatusNormalClosure, "")
	}
	if err != nil {
		o.conn = nil
		o.err = err.Error()
		o.retryLocked()
		o.mu.Unlock()
		return err
	}
	o.conn = c
	o.err = ""
	o.mu.Unlock()
	go o.watch(c)
	return nil
}

func (o *obsClient) take() *obsConn {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.conn
}

func (o *obsClient) schedule() {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.conn == nil {
		return
	}
	if o.timer != nil {
		o.timer.Stop()
	}
	o.timer = time.AfterFunc(200*time.Millisecond, func() { _ = o.syncLayout() })
}

func dialObs(ctx context.Context, cfg obsSettings) (*obsConn, error) {
	u := "ws://" + cfg.Host + ":" + strconv.Itoa(cfg.Port)
	ws, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		return nil, err
	}
	var hello obsWire
	if err := wsjson.Read(ctx, ws, &hello); err != nil {
		_ = ws.Close(websocket.StatusAbnormalClosure, "")
		return nil, err
	}
	if hello.Op != 0 {
		_ = ws.Close(websocket.StatusAbnormalClosure, "hello")
		return nil, fmt.Errorf("obs: expected hello, op %d", hello.Op)
	}
	var hd struct {
		Authentication *struct {
			Challenge string `json:"challenge"`
			Salt      string `json:"salt"`
		} `json:"authentication"`
	}
	_ = json.Unmarshal(hello.D, &hd)
	ident := map[string]any{"rpcVersion": 1, "eventSubscriptions": 0}
	if hd.Authentication != nil {
		ident["authentication"] = obsAuth(cfg.Password, hd.Authentication.Salt, hd.Authentication.Challenge)
	}
	raw, _ := json.Marshal(ident)
	if err := wsjson.Write(ctx, ws, obsWire{Op: 1, D: raw}); err != nil {
		_ = ws.Close(websocket.StatusAbnormalClosure, "")
		return nil, err
	}
	var ided obsWire
	if err := wsjson.Read(ctx, ws, &ided); err != nil {
		_ = ws.Close(websocket.StatusAbnormalClosure, "")
		return nil, err
	}
	if ided.Op != 2 {
		_ = ws.Close(websocket.StatusAbnormalClosure, "identify")
		return nil, fmt.Errorf("obs: identify failed")
	}
	return &obsConn{ws: ws, pending: map[string]chan obsReply{}}, nil
}

func (o *obsClient) watch(c *obsConn) {
	c.readLoop()
	o.mu.Lock()
	if o.conn == c {
		o.conn = nil
		if o.err == "" {
			o.err = "disconnected"
		}
		o.retryLocked()
	}
	o.mu.Unlock()
}

// retryLocked schedules a reconnect while the user still wants OBS, so an OBS
// restart (or OBS starting after us) heals without clicking Connect.
// ponytail: fixed 5s retry, no backoff; fine for one local OBS, add backoff if it ever dials remote hosts.
func (o *obsClient) retryLocked() {
	if !o.want {
		return
	}
	if o.retry != nil {
		o.retry.Stop()
	}
	o.retry = time.AfterFunc(5*time.Second, func() {
		o.mu.Lock()
		again := o.want && o.conn == nil
		o.mu.Unlock()
		if again && o.connect() == nil {
			o.schedule() // layout may have changed while OBS was away
		}
	})
}

func (c *obsConn) readLoop() {
	ctx := context.Background()
	for {
		var msg obsWire
		if err := wsjson.Read(ctx, c.ws, &msg); err != nil {
			c.failAll(err.Error())
			return
		}
		if msg.Op != 7 {
			continue
		}
		var d struct {
			RequestId     string `json:"requestId"`
			RequestStatus struct {
				Result  bool   `json:"result"`
				Comment string `json:"comment"`
			} `json:"requestStatus"`
			ResponseData json.RawMessage `json:"responseData"`
		}
		if err := json.Unmarshal(msg.D, &d); err != nil {
			continue
		}
		c.mu.Lock()
		ch := c.pending[d.RequestId]
		delete(c.pending, d.RequestId)
		c.mu.Unlock()
		if ch == nil {
			continue
		}
		ch <- obsReply{ok: d.RequestStatus.Result, msg: d.RequestStatus.Comment, data: d.ResponseData}
	}
}

func (c *obsConn) failAll(msg string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for id, ch := range c.pending {
		ch <- obsReply{msg: msg}
		delete(c.pending, id)
	}
}

func (c *obsConn) call(typ string, data any) (json.RawMessage, error) {
	id := strconv.FormatUint(c.id.Add(1), 10)
	body := map[string]any{"requestType": typ, "requestId": id}
	if data != nil {
		body["requestData"] = data
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	ch := make(chan obsReply, 1)
	c.mu.Lock()
	c.pending[id] = ch
	c.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := wsjson.Write(ctx, c.ws, obsWire{Op: 6, D: raw}); err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, err
	}
	select {
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, ctx.Err()
	case r := <-ch:
		if !r.ok {
			if r.msg == "" {
				r.msg = typ + " failed"
			}
			return nil, fmt.Errorf("%s", r.msg)
		}
		return r.data, nil
	}
}

func (o *obsClient) call(typ string, data any) (json.RawMessage, error) {
	c := o.take()
	if c == nil {
		return nil, fmt.Errorf("obs: not connected")
	}
	raw, err := c.call(typ, data)
	if err != nil {
		o.mu.Lock()
		o.err = err.Error()
		o.mu.Unlock()
	}
	return raw, err
}

func (o *obsClient) cameras() ([]obsCam, error) {
	raw, err := o.call("GetInputList", nil)
	if err != nil {
		return nil, err
	}
	var doc struct {
		Inputs []struct {
			InputName string `json:"inputName"`
			InputKind string `json:"inputKind"`
		} `json:"inputs"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	skip := map[string]bool{obsMask: true, obsOverlay: true, obsWrap: true, obsScene: true}
	out := []obsCam{}
	for _, in := range doc.Inputs {
		if in.InputKind != obsKindVCD || skip[in.InputName] {
			continue
		}
		out = append(out, obsCam{Name: in.InputName, Kind: in.InputKind})
	}
	return out, nil
}

func (o *obsClient) devices(input string) ([]obsWebcam, error) {
	raw, err := o.call("GetInputPropertiesListPropertyItems", map[string]any{
		"inputName": input, "propertyName": "video_device_id",
	})
	if err != nil {
		return nil, err
	}
	var doc struct {
		PropertyItems []struct {
			ItemName    string `json:"itemName"`
			ItemEnabled bool   `json:"itemEnabled"`
			ItemValue   any    `json:"itemValue"`
		} `json:"propertyItems"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	out := []obsWebcam{}
	for _, it := range doc.PropertyItems {
		if !it.ItemEnabled {
			continue
		}
		out = append(out, obsWebcam{Name: it.ItemName, Value: fmt.Sprint(it.ItemValue)})
	}
	return out, nil
}

func (o *obsClient) sceneNames() (map[string]bool, error) {
	raw, err := o.call("GetSceneList", nil)
	if err != nil {
		return nil, err
	}
	var doc struct {
		Scenes []struct {
			SceneName string `json:"sceneName"`
		} `json:"scenes"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	m := map[string]bool{}
	for _, s := range doc.Scenes {
		m[s.SceneName] = true
	}
	return m, nil
}

func (o *obsClient) ensureScene(name string) error {
	names, err := o.sceneNames()
	if err != nil {
		return err
	}
	if names[name] {
		return nil
	}
	_, err = o.call("CreateScene", map[string]any{"sceneName": name})
	return err
}

func (o *obsClient) inputExists(name string) (bool, string, error) {
	raw, err := o.call("GetInputList", nil)
	if err != nil {
		return false, "", err
	}
	var doc struct {
		Inputs []struct {
			InputName string `json:"inputName"`
			InputKind string `json:"inputKind"`
		} `json:"inputs"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return false, "", err
	}
	for _, in := range doc.Inputs {
		if in.InputName == name {
			return true, in.InputKind, nil
		}
	}
	return false, "", nil
}

func (o *obsClient) items(scene string) ([]struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}, error) {
	raw, err := o.call("GetSceneItemList", map[string]any{"sceneName": scene})
	if err != nil {
		return nil, err
	}
	var doc struct {
		SceneItems []struct {
			SceneItemId int    `json:"sceneItemId"`
			SourceName  string `json:"sourceName"`
		} `json:"sceneItems"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	out := make([]struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}, 0, len(doc.SceneItems))
	for _, it := range doc.SceneItems {
		out = append(out, struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		}{it.SceneItemId, it.SourceName})
	}
	return out, nil
}

func (o *obsClient) ensureItem(scene, source string, enabled bool) error {
	list, err := o.items(scene)
	if err != nil {
		return err
	}
	for _, it := range list {
		if it.Name == source {
			_, err = o.call("SetSceneItemEnabled", map[string]any{
				"sceneName": scene, "sceneItemId": it.ID, "sceneItemEnabled": enabled,
			})
			return err
		}
	}
	_, err = o.call("CreateSceneItem", map[string]any{
		"sceneName": scene, "sourceName": source, "sceneItemEnabled": enabled,
	})
	return err
}

func (o *obsClient) ensureInput(scene, name, kind string, settings map[string]any, enabled bool) error {
	ok, _, err := o.inputExists(name)
	if err != nil {
		return err
	}
	if ok {
		if settings != nil {
			if _, err := o.call("SetInputSettings", map[string]any{
				"inputName": name, "inputSettings": settings, "overlay": true,
			}); err != nil {
				return err
			}
		}
		return o.ensureItem(scene, name, enabled)
	}
	_, err = o.call("CreateInput", map[string]any{
		"sceneName": scene, "inputName": name, "inputKind": kind,
		"inputSettings": settings, "sceneItemEnabled": enabled,
	})
	return err
}

func (o *obsClient) setBounds(scene, source string, x, y, w, h float64) error {
	list, err := o.items(scene)
	if err != nil {
		return err
	}
	var id int
	found := false
	for _, it := range list {
		if it.Name == source {
			id, found = it.ID, true
			break
		}
	}
	if !found {
		return fmt.Errorf("obs: missing %s in %s", source, scene)
	}
	_, err = o.call("SetSceneItemTransform", map[string]any{
		"sceneName": scene, "sceneItemId": id,
		"sceneItemTransform": map[string]any{
			"alignment": 5, "boundsAlignment": 5,
			"boundsType":  "OBS_BOUNDS_STRETCH",
			"boundsWidth": w, "boundsHeight": h,
			"positionX": x, "positionY": y,
			"rotation": 0, "scaleX": 1, "scaleY": 1,
			"cropLeft": 0, "cropRight": 0, "cropTop": 0, "cropBottom": 0,
		},
	})
	return err
}

func browserURL(path string) string {
	return "http://" + addr + path
}

func browserSettings(path string, w, h int) map[string]any {
	return map[string]any{
		"url": browserURL(path), "width": w, "height": h,
		"fps": 30, "shutdown": false, "restart_when_active": false,
		"css": "body { margin: 0; overflow: hidden; background-color: rgba(0,0,0,0); }",
	}
}

func maskBrowserSettings(w, h int) map[string]any {
	return map[string]any{
		"url": browserURL("/mask"), "width": w, "height": h,
		"fps": 30, "shutdown": false, "restart_when_active": false,
		"css": "html, body { margin: 0; overflow: hidden; background: #000; }",
	}
}

func (o *obsClient) pickCamera() (string, error) {
	cfg, err := o.st.obs()
	if err != nil {
		return "", err
	}
	cams, err := o.cameras()
	if err != nil {
		return "", err
	}
	if cfg.Camera != "" {
		for _, c := range cams {
			if c.Name == cfg.Camera {
				return c.Name, nil
			}
		}
	}
	if len(cams) > 0 {
		return cams[0].Name, nil
	}
	return "", nil
}

func (o *obsClient) ensureCamera(name string) (string, error) {
	if name != "" {
		return name, nil
	}
	ok, _, err := o.inputExists(obsDevice)
	if err != nil {
		return "", err
	}
	if !ok {
		if _, err := o.call("CreateInput", map[string]any{
			"sceneName": obsScene, "inputName": obsDevice, "inputKind": obsKindVCD,
			"inputSettings": map[string]any{}, "sceneItemEnabled": true,
		}); err != nil {
			return "", err
		}
	}
	return obsDevice, nil
}

func dedicatedCam(name string) bool {
	return name == "" || name == obsDevice
}

func pluginErr(err error) error {
	return fmt.Errorf("install Advanced Masks: https://github.com/FiniteSingularity/obs-advanced-masks (%s)", err)
}

func (o *obsClient) videoSize() (int, int) {
	raw, err := o.call("GetVideoSettings", nil)
	if err != nil {
		return 1920, 1080
	}
	var doc struct {
		BaseWidth  int `json:"baseWidth"`
		BaseHeight int `json:"baseHeight"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil || doc.BaseWidth <= 0 || doc.BaseHeight <= 0 {
		return 1920, 1080
	}
	return doc.BaseWidth, doc.BaseHeight
}

func (o *obsClient) layout() obsLayoutDoc {
	d := o.design()
	if !o.connected() {
		return obsLayout(d, 1920, 1080)
	}
	w, h := o.videoSize()
	return obsLayout(d, w, h)
}

func (o *obsClient) setWrapCamera(cam string) error {
	list, err := o.items(obsWrap)
	if err != nil {
		return err
	}
	have := false
	for _, it := range list {
		if it.Name == cam {
			have = true
			continue
		}
		_, _ = o.call("RemoveSceneItem", map[string]any{"sceneName": obsWrap, "sceneItemId": it.ID})
	}
	if !have {
		if err := o.ensureItem(obsWrap, cam, true); err != nil {
			return err
		}
	}
	return nil
}

func (o *obsClient) ensureFilter(source string) error {
	if _, err := o.call("GetSourceFilterDefaultSettings", map[string]any{"filterKind": obsKindAM}); err != nil {
		return pluginErr(err)
	}
	raw, err := o.call("GetSourceFilterList", map[string]any{"sourceName": source})
	if err != nil {
		return err
	}
	var doc struct {
		Filters []struct {
			FilterName string `json:"filterName"`
		} `json:"filters"`
	}
	_ = json.Unmarshal(raw, &doc)
	settings := map[string]any{
		"mask_type": 2, "mask_effect": 1,
		"mask_source": obsMask, "mask_source_mask_properties_list": 2,
	}
	for _, f := range doc.Filters {
		if f.FilterName == obsFilter {
			_, err = o.call("SetSourceFilterSettings", map[string]any{
				"sourceName": source, "filterName": obsFilter, "filterSettings": settings, "overlay": true,
			})
			return err
		}
	}
	_, err = o.call("CreateSourceFilter", map[string]any{
		"sourceName": source, "filterName": obsFilter, "filterKind": obsKindAM, "filterSettings": settings,
	})
	if err != nil {
		return pluginErr(err)
	}
	return nil
}

func (o *obsClient) repair() error {
	cfg, err := o.st.obs()
	if err != nil {
		return err
	}
	if err := o.ensureScene(obsScene); err != nil {
		return err
	}
	cam, err := o.pickCamera()
	if err != nil {
		return err
	}
	cam, err = o.ensureCamera(cam)
	if err != nil {
		return err
	}
	cfg.Camera = cam
	if _, err := o.st.saveObs(cfg); err != nil {
		return err
	}
	filterOn := cam
	if dedicatedCam(cam) {
		if err := o.ensureItem(obsScene, cam, true); err != nil {
			return err
		}
	} else {
		if err := o.ensureScene(obsWrap); err != nil {
			return err
		}
		if err := o.setWrapCamera(cam); err != nil {
			return err
		}
		if err := o.ensureItem(obsScene, obsWrap, true); err != nil {
			return err
		}
		filterOn = obsWrap
	}
	lay := o.layout()
	if err := o.ensureInput(obsScene, obsMask, obsKindWeb, maskBrowserSettings(lay.CameraW, lay.CameraH), true); err != nil {
		return err
	}
	if err := o.ensureInput(obsScene, obsOverlay, obsKindWeb, browserSettings("/overlay", lay.OverlayW, lay.OverlayH), true); err != nil {
		return err
	}
	if err := o.ensureFilter(filterOn); err != nil {
		return err
	}
	if err := o.restack(); err != nil {
		return err
	}
	return o.syncLayout()
}

func (o *obsClient) restack() error {
	list, err := o.items(obsScene)
	if err != nil {
		return err
	}
	for _, it := range list {
		if it.Name != obsOverlay {
			continue
		}
		_, err = o.call("SetSceneItemIndex", map[string]any{
			"sceneName": obsScene, "sceneItemId": it.ID, "sceneItemIndex": len(list) - 1,
		})
		return err
	}
	return nil
}

// deviceName turns a dshow video_device_id ("Logitech BRIO:\\?\usb#...") into
// the friendly name the browser also shows as the camera label.
func deviceName(id string) string {
	name, _, _ := strings.Cut(id, ":")
	return strings.TrimSpace(name)
}

// camActive hands the webcam to OBS (on) or releases it so the Designer
// preview can open it (off). Returns the device friendly name for matching.
// Offline OBS is not an error: the browser can grab the camera on its own.
func (o *obsClient) camActive(on bool) (string, error) {
	if !o.connected() {
		return "", nil
	}
	cfg, err := o.st.obs()
	if err != nil {
		return "", err
	}
	cam := cfg.Camera
	if cam == "" {
		cam = obsDevice
	}
	raw, err := o.call("GetInputSettings", map[string]any{"inputName": cam})
	if err != nil {
		return "", err
	}
	var doc struct {
		InputSettings struct {
			Active   *bool  `json:"active"`
			DeviceID string `json:"video_device_id"`
		} `json:"inputSettings"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return "", err
	}
	// ponytail: win-dshow only exposes a toggle button; we trust its saved
	// "active" key (missing = active) to know which way to press it.
	active := doc.InputSettings.Active == nil || *doc.InputSettings.Active
	if active != on {
		if _, err := o.call("PressInputPropertiesButton", map[string]any{
			"inputName": cam, "propertyName": "activate",
		}); err != nil {
			return "", err
		}
	}
	return deviceName(doc.InputSettings.DeviceID), nil
}

func (o *obsClient) syncLayout() error {
	if !o.connected() {
		return nil
	}
	lay := o.layout()
	cfg, _ := o.st.obs()
	cam := cfg.Camera
	if dedicatedCam(cam) {
		if cam == "" {
			cam = obsDevice
		}
		_ = o.setBounds(obsScene, cam, float64(lay.PadX), float64(lay.PadY), float64(lay.CameraW), float64(lay.CameraH))
	} else {
		_ = o.setBounds(obsWrap, cam, 0, 0, float64(lay.CameraW), float64(lay.CameraH))
		_ = o.setBounds(obsScene, obsWrap, float64(lay.PadX), float64(lay.PadY), float64(lay.CameraW), float64(lay.CameraH))
	}
	_ = o.ensureInput(obsScene, obsMask, obsKindWeb, maskBrowserSettings(lay.CameraW, lay.CameraH), true)
	_ = o.ensureInput(obsScene, obsOverlay, obsKindWeb, browserSettings("/overlay", lay.OverlayW, lay.OverlayH), true)
	_ = o.setBounds(obsScene, obsMask, float64(lay.OverlayW+64), 0, float64(lay.CameraW), float64(lay.CameraH))
	_ = o.restack()
	return o.setBounds(obsScene, obsOverlay, 0, 0, float64(lay.OverlayW), float64(lay.OverlayH))
}
