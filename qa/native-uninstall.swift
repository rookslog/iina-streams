// QA only: inspect by default; explicit uninstall uses a real More pointer event.
import Cocoa
import ApplicationServices
import Darwin

let names = ["unified": "Streams Unified Candidate", "focus": "Streams Focus Candidate"]
let arguments = Array(CommandLine.arguments.dropFirst())
var report: [String: Any] = ["ok": false, "actions": [String: Int32]()]
func finish(_ code: String, _ success: Bool = false) -> Never {
    report["ok"] = success; report["phase"] = code
    let data = (try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])) ?? Data("{\"ok\":false}".utf8)
    print(String(decoding: data, as: UTF8.self)); exit(success ? 0 : 1)
}
guard (2...3).contains(arguments.count), let pid = Int32(arguments[0]), pid > 0,
      let candidate = names[arguments[1]] else { finish("usage: PID unified|focus [inspect|uninstall]") }
let mode = arguments.count == 3 ? arguments[2] : "inspect"
guard ["inspect", "uninstall"].contains(mode) else { finish("invalid-mode") }
report["pid"] = pid; report["candidate"] = candidate; report["mode"] = mode
guard let running = NSRunningApplication(processIdentifier: pid), !running.isTerminated,
      running.bundleIdentifier == "com.colliderli.iina",
      running.bundleURL?.standardizedFileURL.path == "/Applications/IINA.app" else { finish("wrong-application") }
guard AXIsProcessTrusted() else { finish("accessibility-not-authorized") }
let application = AXUIElementCreateApplication(pid)
let deadline = ProcessInfo.processInfo.systemUptime + 20.0
var reads = 0, lastWalkComplete = true
func alive() -> Bool { guard let current = NSRunningApplication(processIdentifier: pid) else { return false }; return !current.isTerminated && current.isEqual(running) }
func frontmost() -> Bool { alive() && NSWorkspace.shared.frontmostApplication?.isEqual(running) == true }
guard frontmost() else { finish("target-not-frontmost") }
report["frontmostVerified"] = true
func stamp(_ action: String, _ phase: String, _ code: Int32? = nil) {
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var entry: [String: Any] = ["action": action, "phase": phase, "at": formatter.string(from: Date()), "uptime": ProcessInfo.processInfo.systemUptime]
    if let code = code { entry["code"] = code }
    var entries = report["actionTimeline"] as? [[String: Any]] ?? []; entries.append(entry); report["actionTimeline"] = entries
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    guard reads < 12000, ProcessInfo.processInfo.systemUptime < deadline else { return nil }
    reads += 1; AXUIElementSetMessagingTimeout(element, 0.25)
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func elements(_ value: CFTypeRef?) -> [AXUIElement] {
    guard let value = value else { return [] }
    if CFGetTypeID(value) == AXUIElementGetTypeID() { return [unsafeBitCast(value, to: AXUIElement.self)] }
    return value as? [AXUIElement] ?? []
}
func string(_ element: AXUIElement, _ name: String) -> String { attribute(element, name) as? String ?? "" }
func children(_ element: AXUIElement) -> [AXUIElement] { elements(attribute(element, "AXChildren")) + elements(attribute(element, "AXSheets")) }
func walk(_ roots: [AXUIElement], _ limit: Int = 1600, _ depth: Int = 14) -> [AXUIElement] {
    var queue = roots.map { ($0, 0) }, result: [AXUIElement] = [], offset = 0
    lastWalkComplete = true
    while offset < queue.count && result.count < limit && ProcessInfo.processInfo.systemUptime < deadline && reads < 12000 {
        let (element, level) = queue[offset]; offset += 1
        if result.contains(where: { CFEqual($0, element) }) { continue }
        result.append(element)
        let descendants = children(element)
        if descendants.count > 200 || (level == depth && !descendants.isEmpty) { lastWalkComplete = false }
        if level < depth { queue += descendants.prefix(200).map { ($0, level + 1) } }
    }
    lastWalkComplete = lastWalkComplete && offset == queue.count && reads < 12000 && ProcessInfo.processInfo.systemUptime < deadline
    return result
}
func label(_ element: AXUIElement) -> String {
    let value = string(element, "AXValue"); return value.isEmpty ? string(element, "AXTitle") : value
}
func named(_ element: AXUIElement) -> Bool { string(element, "AXRole") == "AXStaticText" && label(element) == candidate }
func summary(_ nodes: [AXUIElement]) -> [[String: String]] {
    nodes.prefix(36).map { element in
        ["role": string(element, "AXRole"), "title": String(string(element, "AXTitle").prefix(120)),
         "description": String(string(element, "AXDescription").prefix(120)),
         "text": string(element, "AXRole") == "AXStaticText" ? String(label(element).prefix(160)) : ""]
    }
}
func frame(_ element: AXUIElement) -> CGRect? {
    guard let rawPosition = attribute(element, "AXPosition"), let rawSize = attribute(element, "AXSize"),
          CFGetTypeID(rawPosition) == AXValueGetTypeID(), CFGetTypeID(rawSize) == AXValueGetTypeID() else { return nil }
    let position = unsafeBitCast(rawPosition, to: AXValue.self), size = unsafeBitCast(rawSize, to: AXValue.self)
    var point = CGPoint.zero, dimensions = CGSize.zero
    guard AXValueGetType(position) == .cgPoint, AXValueGetType(size) == .cgSize,
          AXValueGetValue(position, .cgPoint, &point), AXValueGetValue(size, .cgSize, &dimensions),
          [point.x, point.y, dimensions.width, dimensions.height].allSatisfy({ $0.isFinite }) else { return nil }
    return CGRect(origin: point, size: dimensions)
}
func frameJSON(_ value: CGRect) -> [String: Double] { ["x": Double(value.minX), "y": Double(value.minY), "width": Double(value.width), "height": Double(value.height)] }
func pointerMore(_ more: AXUIElement) {
    var owner: pid_t = 0
    guard frontmost(), ProcessInfo.processInfo.systemUptime < deadline, AXUIElementGetPid(more, &owner) == .success, owner == pid,
          attribute(more, "AXEnabled") as? Bool == true, let bounds = frame(more),
          bounds.width >= 2, bounds.height >= 2, bounds.width <= 256, bounds.height <= 256 else { finish("unsafe-More-frame-or-focus") }
    let point = CGPoint(x: bounds.midX.rounded(), y: bounds.midY.rounded())
    var displays = [CGDirectDisplayID](repeating: 0, count: 16), count: UInt32 = 0
    guard abs(point.x) < 100000, abs(point.y) < 100000,
          CGGetActiveDisplayList(16, &displays, &count) == .success, count > 0,
          displays.prefix(Int(count)).contains(where: { CGDisplayBounds($0).contains(point) }) else { finish("More-point-outside-active-displays") }
    var hit: AXUIElement?; var hitMore = false
    guard AXUIElementCopyElementAtPosition(application, Float(point.x), Float(point.y), &hit) == .success else { finish("More-hit-test-failed") }
    for _ in 0..<6 { guard let item = hit else { break }; if CFEqual(item, more) { hitMore = true; break }; hit = elements(attribute(item, "AXParent")).first }
    guard hitMore, frontmost() else { finish("More-is-not-the-visible-pointer-target") }
    report["moreFrame"] = frameJSON(bounds); report["moreClick"] = ["x": point.x, "y": point.y, "method": "cliclick"] as [String: Any]
    let process = Process(); process.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/cliclick")
    process.arguments = ["c:=\(Int(point.x)),=\(Int(point.y))"]; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
    stamp("More-pointer", "before")
    do { try process.run() } catch { stamp("More-pointer", "launch-failed"); finish("cliclick-launch-failed") }
    let clickDeadline = min(deadline, ProcessInfo.processInfo.systemUptime + 2.0)
    while process.isRunning && ProcessInfo.processInfo.systemUptime < clickDeadline { Thread.sleep(forTimeInterval: 0.02) }
    if process.isRunning { process.terminate(); Thread.sleep(forTimeInterval: 0.05); if process.isRunning { kill(process.processIdentifier, SIGKILL) }; stamp("More-pointer", "timeout"); finish("cliclick-timeout") }
    stamp("More-pointer", "after", process.terminationStatus)
    guard process.terminationStatus == 0 else { finish("cliclick-failed-no-AX-fallback") }
}
func press(_ element: AXUIElement, _ name: String) {
    var owner: pid_t = 0
    guard ["Uninstall", "OK"].contains(name), reads < 12000, ProcessInfo.processInfo.systemUptime < deadline, frontmost(), AXUIElementGetPid(element, &owner) == .success, owner == pid,
          attribute(element, "AXEnabled") as? Bool == true else { finish("unsafe-or-disabled-" + name) }
    AXUIElementSetMessagingTimeout(element, 0.25)
    stamp(name, "before")
    let result = AXUIElementPerformAction(element, "AXPress" as CFString)
    stamp(name, "after", result.rawValue)
    var actions = report["actions"] as? [String: Int32] ?? [:]; actions[name] = result.rawValue; report["actions"] = actions
    // A modal action may time out after opening its menu/sheet. Observe once; never re-press.
    guard result == .success || result == .cannotComplete else { finish("action-failed-" + name) }
}
let windows = elements(attribute(application, "AXWindows"))
let settings = windows.filter {
    let title = string($0, "AXTitle").lowercased()
    return title.contains("settings") || title.contains("preferences") || title == "plugins"
}
var matches: [(AXUIElement, AXUIElement)] = []
for window in settings {
    let nodes = walk([window]); guard lastWalkComplete else { finish("settings-tree-exceeds-limits") }
    for item in nodes.filter(named) { matches.append((window, item)) }
}
report["settingsWindowCount"] = settings.count; report["candidateMatches"] = matches.count
guard matches.count == 1 else { finish("candidate-settings-row-not-unique") }
let (settingsWindow, candidateLabel) = matches[0]
var row = candidateLabel, selectedRow: AXUIElement?, selectedMore: AXUIElement?
for _ in 0..<8 {
    guard let parent = elements(attribute(row, "AXParent")).first else { break }; row = parent
    let nodes = walk([row], 120, 6)
    let otherCandidate = nodes.contains { string($0, "AXRole") == "AXStaticText" && names.values.contains(label($0)) && label($0) != candidate }
    let buttons = nodes.filter { string($0, "AXRole") == "AXButton" &&
        (string($0, "AXDescription") == "More" || string($0, "AXTitle") == "More") }
    if !otherCandidate && nodes.filter(named).count == 1 && buttons.count == 1 { selectedRow = row; selectedMore = buttons[0]; break }
}
guard let retainedRow = selectedRow, let more = selectedMore else { finish("candidate-more-button-not-unique") }
report["windowTitle"] = string(settingsWindow, "AXTitle")
report["row"] = summary(walk([retainedRow], 60, 5))
if let bounds = frame(retainedRow) { report["rowFrame"] = frameJSON(bounds) }
if let bounds = frame(more) { report["moreFrame"] = frameJSON(bounds) }
func menuRoots() -> [AXUIElement] {
    let appMenus = children(application).filter { string($0, "AXRole") == "AXMenu" }
    return [more, retainedRow, settingsWindow] + appMenus + elements(attribute(application, "AXMenus")) + elements(attribute(application, "AXFocusedUIElement"))
}
if mode == "inspect" {
    report["menus"] = summary(walk(menuRoots(), 150, 7).filter { ["AXMenu", "AXMenuItem"].contains(string($0, "AXRole")) })
    report["reads"] = reads; finish("inspected-no-actions", true)
}
pointerMore(more) // No AXPress fallback: the native More action needs a pointer event.
var uninstall: AXUIElement?
for _ in 0..<20 {
    let items = walk(menuRoots(), 450, 10).filter { string($0, "AXRole") == "AXMenuItem" && string($0, "AXTitle") == "Uninstall" }
    if items.count > 1 { finish("uninstall-menu-not-unique") }
    if let item = items.first { uninstall = item; break }
    if !alive() || ProcessInfo.processInfo.systemUptime >= deadline { break }; Thread.sleep(forTimeInterval: 0.1)
}
guard let uninstallItem = uninstall else { finish("uninstall-menu-not-found") }
press(uninstallItem, "Uninstall")
var confirmation: AXUIElement?, confirmButton: AXUIElement?
let expectedTitle = "Are you sure to uninstall " + candidate + "?"
for _ in 0..<20 {
    let roots = [settingsWindow] + elements(attribute(application, "AXWindows"))
    let dialogs = walk(roots, 1800, 14).filter { element in
        ["AXSheet", "AXDialog"].contains(string(element, "AXRole")) || ["AXDialog", "AXSystemDialog"].contains(string(element, "AXSubrole"))
    }
    var found: [(AXUIElement, AXUIElement)] = []
    for dialog in dialogs {
        let nodes = walk([dialog], 100, 7)
        let texts = nodes.filter { string($0, "AXRole") == "AXStaticText" }.map(label)
        let ok = nodes.filter { string($0, "AXRole") == "AXButton" && string($0, "AXTitle") == "OK" }
        if texts.contains(expectedTitle) && ok.count == 1 { found.append((dialog, ok[0])) }
    }
    if found.count > 1 { finish("confirmation-not-unique") }
    if let match = found.first { confirmation = match.0; confirmButton = match.1; break }
    if !alive() || ProcessInfo.processInfo.systemUptime >= deadline { break }; Thread.sleep(forTimeInterval: 0.1)
}
guard let sheet = confirmation, let ok = confirmButton else { finish("candidate-confirmation-not-found-no-OK") }
guard walk([sheet], 100, 7).contains(where: { string($0, "AXRole") == "AXStaticText" && label($0) == expectedTitle }) else { finish("confirmation-changed-no-OK") }
report["confirmationTitle"] = expectedTitle; press(ok, "OK")
for _ in 0..<20 {
    guard alive() else { finish("application-ended-result-unconfirmed") }
    if attribute(settingsWindow, "AXChildren") != nil && string(settingsWindow, "AXRole") == "AXWindow" {
        let remaining = walk([settingsWindow]).filter(named)
        if remaining.isEmpty && lastWalkComplete && reads < 12000 && ProcessInfo.processInfo.systemUptime < deadline {
            report["candidateRowAbsent"] = true; report["reads"] = reads; finish("candidate-row-removed", true)
        }
    }
    if ProcessInfo.processInfo.systemUptime >= deadline { break }; Thread.sleep(forTimeInterval: 0.1)
}
finish("confirmation-accepted-removal-unconfirmed")
