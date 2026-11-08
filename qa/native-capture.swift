// QA-only screenshot of one owned IINA window after its visible frame settles.
import Cocoa
import CoreGraphics
let a=Array(CommandLine.arguments.dropFirst())
guard a.count==3,let pid=Int32(a[0]),let app=NSRunningApplication(processIdentifier:pid),app.bundleURL?.path=="/Applications/IINA.app" else{exit(2)}
let path=URL(fileURLWithPath:a[2]).standardizedFileURL.path
guard path.hasPrefix("/Users/rookslog/development/iina-streams-candidates/evidence/native/"),path.hasSuffix(".png"),!FileManager.default.fileExists(atPath:path) else{exit(3)}
_ = app.activate(options:[.activateAllWindows])
var previous:CGRect?,stable=0,selected:[String:Any]?
for _ in 0..<40 {
 RunLoop.current.run(until:Date(timeIntervalSinceNow:0.1))
 let list=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
 let matches=list.filter{($0[kCGWindowOwnerPID as String] as? Int32)==pid && ($0[kCGWindowLayer as String] as? Int)==0 && ($0[kCGWindowName as String] as? String)==a[1]}
 if matches.count==1,let raw=matches[0][kCGWindowBounds as String] as? [String:Any],let rect=CGRect(dictionaryRepresentation:raw as CFDictionary){
  stable = previous==rect ? stable+1:0;previous=rect
  if stable>=2 {selected=matches[0];break}
 }
}
guard let window=selected,let id=window[kCGWindowNumber as String] as? Int else{print("No unique settled on-screen owned window");exit(4)}
let p=Process();p.executableURL=URL(fileURLWithPath:"/usr/sbin/screencapture");p.arguments=["-x","-l",String(id),path];try p.run();p.waitUntilExit()
let result:[String:Any]=["pid":pid,"title":a[1],"windowID":id,"bounds":window[kCGWindowBounds as String] ?? [:],"timeUTC":ISO8601DateFormatter().string(from:Date()),"screenshot":path,"exit":p.terminationStatus]
print(String(decoding:try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]),as:UTF8.self));exit(p.terminationStatus)
