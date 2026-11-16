// QA only. Root runs this explicitly; the author performs no native actions.
// One process retains AX references. No AppleScript window indexes or QA bridge.
import Cocoa
import ApplicationServices
import Darwin

let args = Array(CommandLine.arguments.dropFirst())
guard args.count == 7, let pid = Int32(args[0]), pid > 0,
      let planned = Int(args[3]), (1...5).contains(planned), ["inspect", "run"].contains(args[5]),
      ["unified", "focus"].contains(args[6]),
      args[1].hasPrefix("All Aboard"), args[2].hasPrefix("Me at the zoo"), args[1] != args[2],
      let running = NSRunningApplication(processIdentifier: pid), !running.isTerminated,
      running.bundleIdentifier == "com.colliderli.iina",
      running.bundleURL?.standardizedFileURL.path == "/Applications/IINA.app" else { exit(2) }
let anchorTitle = args[1], childTitle = args[2], output = URL(fileURLWithPath: args[4]), mode = args[5], variant = args[6]
let publicURL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
let promptText = "Twitch channel, Twitch recording, or YouTube URL"
let openMenuTitle = "Open Stream — " + (variant == "focus" ? "Focus" : "Unified") + "…"
let application = AXUIElementCreateApplication(pid)
let deadline = ProcessInfo.processInfo.systemUptime + Double(planned * 45 + 15)
let formatter = ISO8601DateFormatter()
formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
func now() -> String { formatter.string(from: Date()) }
var report: [String: Any] = [
    "schemaVersion": 1, "startedUTC": now(), "pid": pid, "mode": mode,
    "publicURL": publicURL, "variant": variant, "expectedOpenMenuTitle": openMenuTitle,
    "plannedCycles": planned, "completedCycles": 0,
    "complete": false, "allPassed": false, "ok": false, "phase": "starting",
    "anchorTitle": anchorTitle, "childTitle": childTitle, "records": [[String: Any]](),
    "actionTimeline": [[String: Any]](),
    "scope": "Normal candidate menu, guarded public prompt, retained AX window identity and AXCloseButton. No QA bridge or mpv data.",
    "limits": ["Resume menu is native paused-state evidence only; exact 120-second position is not inspected.",
               "A resolved child title does not prove decoded video/audio or network quality.",
               "This is a bounded ordinary-YouTube child lifecycle test, not mixed Twitch or long-session proof.",
               "On failure cleanup only requests AXCancel on the exact menu this harness opened; no window close, playback toggle, or app termination is performed.",
               "AXCancel success records an accepted cancellation request, not proof that AppKit menu tracking or all AppleEvent responsiveness recovered."]
]
var reads = 0, cycle = 0
var retainedOpenedMenu: AXUIElement?, retainedOpenedMenuName = ""
func save() {
    report["updatedUTC"] = now(); report["reads"] = reads
    do {
        let attributes = try FileManager.default.attributesOfItem(atPath: output.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular else { exit(9) }
        let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: output, options: [.atomic])
    } catch { fputs("Could not persist partial lifecycle evidence\n", stderr); exit(9) }
}
func finish(_ phase: String, _ success: Bool = false) -> Never {
    if retainedOpenedMenu != nil { _ = cancelOpenedMenu(reason: "finish-" + phase) }
    report["phase"] = phase; report["ok"] = success; report["endedUTC"] = now(); save()
    let summary: [String: Any] = ["ok": success, "phase": phase, "output": output.path,
        "completedCycles": report["completedCycles"] ?? 0, "plannedCycles": planned]
    print(String(decoding: (try? JSONSerialization.data(withJSONObject: summary, options: [.sortedKeys])) ?? Data(), as: UTF8.self))
    exit(success ? 0 : 1)
}
func alive() -> Bool {
    guard let current = NSRunningApplication(processIdentifier: pid) else { return false }
    return !current.isTerminated && current.isEqual(running)
}
func frontmost() -> Bool { alive() && NSWorkspace.shared.frontmostApplication?.isEqual(running) == true }
func bounded() -> Bool { alive() && reads < 70000 && ProcessInfo.processInfo.systemUptime < deadline }
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    guard bounded() else { return nil }; reads += 1
    AXUIElementSetMessagingTimeout(element, 0.25)
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func elements(_ raw: CFTypeRef?) -> [AXUIElement] {
    guard let raw = raw else { return [] }
    if CFGetTypeID(raw) == AXUIElementGetTypeID() { return [unsafeBitCast(raw, to: AXUIElement.self)] }
    return raw as? [AXUIElement] ?? []
}
func string(_ e: AXUIElement, _ n: String) -> String { attribute(e, n) as? String ?? "" }
func children(_ e: AXUIElement) -> [AXUIElement] { elements(attribute(e, "AXChildren")) }
func windows() -> [AXUIElement] {
    // An IPC timeout must never become an empty list and a false closure claim.
    var attempts = [[String: Any]]()
    for (index, timeout) in [Float(0.25), Float(2.0)].enumerated() {
        guard bounded(), ProcessInfo.processInfo.systemUptime + Double(timeout) < deadline else { break }
        reads += 1; AXUIElementSetMessagingTimeout(application, timeout)
        let before = now(); var raw: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(application, "AXWindows" as CFString, &raw)
        AXUIElementSetMessagingTimeout(application, 0.25)
        var entry: [String: Any] = ["attempt": index + 1, "timeoutSeconds": timeout,
            "beforeUTC": before, "afterUTC": now(), "AXResult": result.rawValue]
        if result == .success, let raw = raw, CFGetTypeID(raw) == CFArrayGetTypeID(), let found = raw as? [AXUIElement] {
            entry["windowCount"] = found.count; entry["validArray"] = true; attempts.append(entry)
            report["lastSuccessfulAXWindowsRead"] = entry
            if index > 0 {
                var diagnostics = report["windowQueryDiagnostics"] as? [[String: Any]] ?? []
                diagnostics.append(["cycle": cycle, "attempts": attempts, "recovered": true])
                report["windowQueryDiagnostics"] = Array(diagnostics.suffix(30)); save()
            }
            return found
        }
        entry["validArray"] = false; attempts.append(entry)
    }
    report["failedAXWindowsRead"] = ["cycle": cycle, "attempts": attempts]
    finish("AX-windows-read-unavailable-no-absence-claim")
}
func contains(_ xs: [AXUIElement], _ e: AXUIElement) -> Bool { xs.contains { CFEqual($0, e) } }
func walk(_ roots: [AXUIElement], limit: Int = 500, depth: Int = 8) -> [AXUIElement] {
    var queue = roots.map { ($0, 0) }, found = [AXUIElement](), index = 0
    while index < queue.count && found.count < limit && bounded() {
        let (item, level) = queue[index]; index += 1
        if contains(found, item) { continue }; found.append(item)
        // Only native menus/dialogs are relevant; never search rendered chat.
        if string(item, "AXRole") == "AXWebArea" { continue }
        let descendants = children(item) + elements(attribute(item, "AXSheets"))
        guard descendants.count <= 160, level < depth || descendants.isEmpty else { finish("native-AX-tree-depth-or-width-limit") }
        if level < depth { queue += descendants.map { ($0, level + 1) } }
    }
    guard index == queue.count, bounded() else { finish("native-AX-tree-count-or-deadline-limit") }
    return found
}
func frame(_ e: AXUIElement) -> [Double]? {
    guard let p = attribute(e, "AXPosition"), let s = attribute(e, "AXSize"),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    let position = unsafeBitCast(p, to: AXValue.self), size = unsafeBitCast(s, to: AXValue.self)
    var point = CGPoint.zero, dimensions = CGSize.zero
    guard AXValueGetValue(position, .cgPoint, &point), AXValueGetValue(size, .cgSize, &dimensions) else { return nil }
    let values = [Double(point.x), Double(point.y), Double(dimensions.width), Double(dimensions.height)]
    return values.allSatisfy { $0.isFinite } && values[2] > 0 && values[3] > 0 ? values : nil
}
func timeline(_ action: String, _ phase: String, _ details: [String: Any] = [:]) {
    var item: [String: Any] = ["cycle": cycle, "action": action, "phase": phase,
        "atUTC": now(), "uptime": ProcessInfo.processInfo.systemUptime]
    details.forEach { item[$0.key] = $0.value }
    var entries = report["actionTimeline"] as? [[String: Any]] ?? []; entries.append(item)
    report["actionTimeline"] = entries; save()
}
func owned(_ e: AXUIElement) -> Bool { var owner: pid_t = 0; return AXUIElementGetPid(e, &owner) == .success && owner == pid }
func action(_ e: AXUIElement, _ axAction: String, _ name: String, modal: Bool = false) {
    guard mode == "run", bounded(), frontmost(), owned(e), ["AXPress", "AXRaise"].contains(axAction) else { finish("unsafe-action-" + name) }
    if axAction == "AXPress" && attribute(e, "AXEnabled") as? Bool != true { finish("disabled-" + name) }
    timeline(name, "before", ["AXAction": axAction, "role": string(e, "AXRole"), "title": String(string(e, "AXTitle").prefix(180))])
    let result = AXUIElementPerformAction(e, axAction as CFString)
    timeline(name, "after", ["AXResult": result.rawValue])
    guard result == .success || (modal && result == .cannotComplete) else { finish("action-failed-" + name) }
}
func settle(_ seconds: Double) {
    let end = min(deadline, ProcessInfo.processInfo.systemUptime + seconds)
    while bounded() && ProcessInfo.processInfo.systemUptime < end { Thread.sleep(forTimeInterval: 0.05) }
    guard bounded() else { finish("deadline-or-process-ended") }
}
func menuBarItem(_ title: String) -> AXUIElement {
    let items = elements(attribute(application, "AXMenuBar")).flatMap(children).filter { string($0, "AXTitle") == title }
    guard items.count == 1 else { finish("menu-not-unique-" + title) }; return items[0]
}
func cancelOpenedMenu(reason: String) -> Bool {
    guard let menu = retainedOpenedMenu else { return true }
    let name = retainedOpenedMenuName
    // Clear first: a failed cleanup must not recursively retry or touch another menu.
    retainedOpenedMenu = nil; retainedOpenedMenuName = ""
    guard mode == "run", alive(), owned(menu) else {
        report["ownedMenuCancellation"] = ["menu": name, "reason": reason, "attempted": false, "gate": "process-or-owner-unavailable"]
        save(); return false
    }
    AXUIElementSetMessagingTimeout(menu, 1.0)
    timeline("cancel-retained-" + name + "-menu", "before", ["AXAction": "AXCancel", "reason": reason, "timeoutSeconds": 1])
    let result = AXUIElementPerformAction(menu, "AXCancel" as CFString)
    timeline("cancel-retained-" + name + "-menu", "after", ["AXResult": result.rawValue])
    report["ownedMenuCancellation"] = ["menu": name, "reason": reason, "attempted": true,
        "AXResult": result.rawValue, "requestAccepted": result == .success, "trackingExitIndependentlyVerified": false]
    save(); return result == .success
}
func openOwnedMenu(_ title: String) -> AXUIElement {
    guard retainedOpenedMenu == nil else { finish("previous-owned-menu-not-dismissed") }
    let item = menuBarItem(title)
    let candidates = children(item).filter { string($0, "AXRole") == "AXMenu" }
    guard candidates.count == 1 else { finish("native-menu-child-not-unique-" + title) }
    let menu = candidates[0]; var names: CFArray?
    AXUIElementSetMessagingTimeout(menu, 0.25)
    let queried = AXUIElementCopyActionNames(menu, &names)
    guard queried == .success, (names as? [String] ?? []).contains("AXCancel"),
          mode == "run", bounded(), frontmost(), owned(item), owned(menu),
          attribute(item, "AXEnabled") as? Bool == true else { finish("owned-menu-open-or-cancel-guard-failed-" + title) }
    timeline("open-" + title + "-menu", "before", ["AXAction": "AXPress", "retainedMenuRole": "AXMenu", "AXCancelSupported": true])
    retainedOpenedMenu = menu; retainedOpenedMenuName = title
    let result = AXUIElementPerformAction(item, "AXPress" as CFString)
    timeline("open-" + title + "-menu", "after", ["AXResult": result.rawValue])
    guard result == .success || result == .cannotComplete else { finish("owned-menu-open-failed-" + title) }
    settle(0.15); return item
}
func dismissOwnedMenu() {
    guard cancelOpenedMenu(reason: "normal-menu-observation-complete") else { finish("owned-menu-cancel-unconfirmed") }
    settle(0.12)
}
func activate(_ window: AXUIElement, _ name: String) {
    guard mode == "run", bounded(), owned(window), contains(windows(), window) else { finish("window-unavailable-" + name) }
    timeline("activate-IINA", "before")
    let activated = running.activate(options: [.activateIgnoringOtherApps])
    timeline("activate-IINA", "after", ["returned": activated]); settle(0.15)
    guard frontmost() else { finish("IINA-not-frontmost") }
    action(window, "AXRaise", "raise-" + name)
    timeline("make-main-" + name, "before")
    let result = AXUIElementSetAttributeValue(window, "AXMain" as CFString, kCFBooleanTrue)
    timeline("make-main-" + name, "after", ["AXResult": result.rawValue])
    for _ in 0..<10 {
        if elements(attribute(application, "AXFocusedWindow")).contains(where: { CFEqual($0, window) }) { return }
        settle(0.1)
    }
    finish("window-focus-unconfirmed-" + name)
}
func pausedMenuState() -> [String: Any] {
    let playback = openOwnedMenu("Playback")
    let matches = walk([playback], limit: 250, depth: 5).filter {
        string($0, "AXRole") == "AXMenuItem" && ["Resume", "Pause"].contains(string($0, "AXTitle")) && attribute($0, "AXEnabled") as? Bool == true
    }
    guard matches.count == 1 else { finish("native-pause-menu-ambiguous") }
    let title = string(matches[0], "AXTitle"); dismissOwnedMenu()
    return ["itemTitle": title, "enabled": true, "pausedByMenu": title == "Resume", "observedUTC": now()]
}
guard AXIsProcessTrusted() else { finish("accessibility-not-authorized") }
let initialWindows = windows(), anchors = initialWindows.filter { string($0, "AXTitle") == anchorTitle }
guard anchors.count == 1, !initialWindows.contains(where: { string($0, "AXTitle") == childTitle }) else { finish("anchor-not-unique-or-child-preexists") }
let anchor = anchors[0] // Retained for the full process, including all close calls.
guard let initialFrame = frame(anchor), attribute(anchor, "AXMinimized") as? Bool != true else { finish("anchor-frame-or-minimized") }
report["initialWindows"] = initialWindows.map { ["title": String(string($0, "AXTitle").prefix(180)), "frame": frame($0) ?? []] as [String: Any] }
report["retainedAnchor"] = ["title": anchorTitle, "frame": initialFrame, "identityMethod": "retained AXUIElement; CFEqual against each current AXWindows list"]
func anchorBasic() -> [String: Any] {
    if mode == "run" && !frontmost() { finish("target-not-frontmost-no-absence-claim") }
    let present = contains(windows(), anchor), title = string(anchor, "AXTitle"), currentFrame = frame(anchor) ?? []
    return ["observedUTC": now(), "sameAXIdentity": present, "title": title, "frame": currentFrame,
            "titleUnchanged": title == anchorTitle, "frameUnchanged": currentFrame == initialFrame,
            "notMinimized": attribute(anchor, "AXMinimized") as? Bool == false, "sameAppProcess": alive()]
}
func anchorValid(_ snapshot: [String: Any]) -> Bool {
    ["sameAXIdentity", "titleUnchanged", "frameUnchanged", "notMinimized", "sameAppProcess"].allSatisfy { snapshot[$0] as? Bool == true }
}
func nativeDialogs() -> [[String: Any]] {
    let roots = windows() + elements(attribute(application, "AXFocusedWindow"))
    let nodes = walk(roots, limit: 1200, depth: 14)
    return nodes.filter {
        ["AXSheet", "AXDialog"].contains(string($0, "AXRole")) ||
        ["AXDialog", "AXSystemDialog"].contains(string($0, "AXSubrole")) || attribute($0, "AXModal") as? Bool == true
    }.prefix(12).map {
        ["role": string($0, "AXRole"), "subrole": string($0, "AXSubrole"),
         "title": String(string($0, "AXTitle").prefix(180)), "modal": attribute($0, "AXModal") as? Bool ?? false] as [String: Any]
    }
}
func requireNoNativeDialogs(_ stage: String) {
    let dialogs = nativeDialogs()
    if !dialogs.isEmpty { report["blockedNativeDialogs"] = dialogs; report["blockedStage"] = stage; finish("preexisting-or-unexpected-native-dialog") }
}
func fullAnchor() -> [String: Any] {
    requireNoNativeDialogs("anchor-observation")
    let before = anchorBasic(); guard anchorValid(before) else { report["failedAnchorObservation"] = before; finish("anchor-changed-or-closed") }
    activate(anchor, "anchor"); var result = anchorBasic(); result["playbackMenu"] = pausedMenuState()
    return result
}
func updateCycle(_ key: String, _ value: Any) {
    var rows = report["records"] as? [[String: Any]] ?? []
    guard !rows.isEmpty else { return }; rows[rows.count - 1][key] = value; report["records"] = rows; save()
}
func prompt() -> (AXUIElement, AXUIElement, AXUIElement)? {
    var matches = [(AXUIElement, AXUIElement, AXUIElement)]()
    let roots = windows().flatMap { [$0] + elements(attribute($0, "AXSheets")) }
    for root in roots {
        let nodes = walk([root], limit: 240, depth: 8)
        let labels = nodes.filter { string($0, "AXRole") == "AXStaticText" && (string($0, "AXValue") == promptText || string($0, "AXTitle") == promptText) }
        let fields = nodes.filter { string($0, "AXRole") == "AXTextField" }
        let okay = nodes.filter { string($0, "AXRole") == "AXButton" && string($0, "AXTitle") == "OK" }
        let cancel = nodes.filter { string($0, "AXRole") == "AXButton" && string($0, "AXTitle") == "Cancel" }
        if labels.count == 1 && fields.count == 1 && okay.count == 1 && cancel.count == 1 {
            if !matches.contains(where: { CFEqual($0.1, fields[0]) }) { matches.append((root, fields[0], okay[0])) }
        }
    }
    guard matches.count < 2 else { finish("multiple-matching-source-prompts") }
    return matches.first
}
if mode == "inspect" {
    report["anchorObservation"] = anchorBasic()
    report["nativeDialogs"] = nativeDialogs()
    report["menuBarTitles"] = elements(attribute(application, "AXMenuBar")).flatMap(children).map { string($0, "AXTitle") }
    report["inspectOnly"] = true; finish("inspected-no-actions", true)
}
requireNoNativeDialogs("before-first-action")
if let _ = prompt() { finish("source-prompt-already-open") }
let initial = fullAnchor(); report["initialAnchor"] = initial
guard (initial["playbackMenu"] as? [String: Any])?["pausedByMenu"] as? Bool == true else { finish("anchor-is-not-natively-paused") }
save()
for number in 1...planned {
    cycle = number
    var rows = report["records"] as? [[String: Any]] ?? []
    rows.append(["cycle": cycle, "startedUTC": now(), "complete": false]); report["records"] = rows; save()
    let before = fullAnchor(); updateCycle("anchorBefore", before)
    guard (before["playbackMenu"] as? [String: Any])?["pausedByMenu"] as? Bool == true else { finish("anchor-unpaused-before-cycle") }
    let beforeWindows = windows()
    guard !beforeWindows.contains(where: { string($0, "AXTitle") == childTitle }) else { finish("child-preexists-before-open") }
    requireNoNativeDialogs("before-source-menu")
    let plugin = openOwnedMenu("Plugin")
    let menuNodes = walk([plugin], limit: 400, depth: 9)
    let items = menuNodes.filter { string($0, "AXRole") == "AXMenuItem" && string($0, "AXTitle") == openMenuTitle }
    updateCycle("pluginMenuObservation", ["observedUTC": now(), "expectedTitle": openMenuTitle, "matchingCommandCount": items.count,
        "menuItems": menuNodes.filter { string($0, "AXRole") == "AXMenuItem" }.prefix(80).map {
            ["title": String(string($0, "AXTitle").prefix(180)), "enabled": attribute($0, "AXEnabled") as? Bool ?? false] as [String: Any]
        }])
    guard items.count == 1 else { finish(variant + "-open-menu-not-unique") }
    action(items[0], "AXPress", "open-" + variant + "-source-prompt", modal: true)
    var foundPrompt: (AXUIElement, AXUIElement, AXUIElement)?
    for _ in 0..<25 { if let found = prompt() { foundPrompt = found; break }; settle(0.1) }
    guard let (_, field, okay) = foundPrompt, owned(field), string(field, "AXValue").isEmpty, frontmost() else { finish("guarded-source-prompt-not-found") }
    // The selected menu command has produced its exact native prompt. Ownership
    // now belongs to that dialog; failure must not cancel a different user UI.
    timeline("release-selected-Plugin-menu", "observed-source-prompt", ["menu": retainedOpenedMenuName])
    retainedOpenedMenu = nil; retainedOpenedMenuName = ""
    timeline("set-public-source", "before", ["publicURL": publicURL])
    let setResult = AXUIElementSetAttributeValue(field, "AXValue" as CFString, publicURL as CFString)
    timeline("set-public-source", "after", ["AXResult": setResult.rawValue])
    guard setResult == .success, string(field, "AXValue") == publicURL,
          let current = prompt(), CFEqual(current.1, field), CFEqual(current.2, okay) else { finish("source-prompt-value-or-identity-changed") }
    action(okay, "AXPress", "confirm-public-source", modal: true); settle(0.7)
    let childDeadline = min(deadline, ProcessInfo.processInfo.systemUptime + 27)
    var retainedChild: AXUIElement?
    while bounded() && ProcessInfo.processInfo.systemUptime < childDeadline {
        let observation = anchorBasic()
        guard anchorValid(observation) else { updateCycle("anchorDuringOpen", observation); finish("anchor-changed-during-child-open") }
        let matches = windows().filter { !contains(beforeWindows, $0) && string($0, "AXTitle") == childTitle }
        if matches.count > 1 { finish("new-child-title-not-unique") }
        if let child = matches.first { retainedChild = child; break }; settle(0.2)
    }
    guard let child = retainedChild else { finish("new-child-window-not-observed") }
    settle(0.7)
    guard contains(windows(), child), !contains(beforeWindows, child), !CFEqual(child, anchor), string(child, "AXTitle") == childTitle else { finish("new-child-identity-or-title-changed") }
    updateCycle("openedChild", ["title": string(child, "AXTitle"), "frame": frame(child) ?? [], "observedUTC": now(), "newRetainedAXIdentity": true])
    let during = anchorBasic(); updateCycle("anchorBeforeClose", during)
    guard anchorValid(during) else { finish("anchor-changed-before-child-close") }
    requireNoNativeDialogs("before-retained-child-close")
    activate(child, "new-child")
    guard let close = elements(attribute(child, "AXCloseButton")).first,
          string(close, "AXSubrole") == "AXCloseButton", owned(close),
          elements(attribute(close, "AXWindow")).contains(where: { CFEqual($0, child) }),
          contains(windows(), child), !contains(beforeWindows, child), !CFEqual(child, anchor),
          string(child, "AXTitle") == childTitle, anchorValid(anchorBasic()) else { finish("retained-child-close-button-guard-failed") }
    updateCycle("closeTarget", ["title": childTitle, "directAXCloseButtonAttribute": true, "buttonAXWindowEqualsRetainedChild": true,
                               "notAnchor": true, "notAnyPreexistingWindow": true])
    action(close, "AXPress", "close-retained-new-child", modal: true)
    for _ in 0..<30 { if !contains(windows(), child) { break }; settle(0.1) }
    guard bounded(), !contains(windows(), child) else { finish("child-close-unconfirmed") }; settle(0.3)
    let after = fullAnchor(); updateCycle("anchorAfter", after)
    let remaining = windows()
    let checks: [String: Bool] = ["childNewRetainedIdentity": true, "childExpectedTitle": true,
        "closeButtonBelongedToChild": true, "childClosed": !contains(remaining, child),
        "anchorSameAXIdentity": after["sameAXIdentity"] as? Bool == true,
        "anchorTitleUnchanged": after["titleUnchanged"] as? Bool == true,
        "anchorFrameUnchanged": after["frameUnchanged"] as? Bool == true,
        "anchorStillNativelyPaused": (after["playbackMenu"] as? [String: Any])?["pausedByMenu"] as? Bool == true,
        "sameAppProcess": alive(), "preexistingWindowsRetained": beforeWindows.allSatisfy { contains(remaining, $0) },
        "windowSetRestored": remaining.count == beforeWindows.count && remaining.allSatisfy { contains(beforeWindows, $0) }]
    updateCycle("checks", checks); updateCycle("endedUTC", now())
    guard checks.values.allSatisfy({ $0 }) else { finish("cycle-invariant-failed") }
    updateCycle("complete", true); report["completedCycles"] = cycle; save()
    print("Completed normal native cycle \(cycle)/\(planned)"); fflush(stdout)
}
report["complete"] = true; report["allPassed"] = true; finish("bounded-normal-cycles-passed", true)
