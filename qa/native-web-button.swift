// QA-only native Accessibility click of one allowlisted button inside the owned WKWebView.
import Cocoa
import ApplicationServices
let a=Array(CommandLine.arguments.dropFirst())
let allowed=["Fetch replay","Chat","Playback","Chat appearance","Hide Streams","Latest messages ↓","First message","Off"]
guard a.count==3, let pid=Int32(a[0]), allowed.contains(a[2]), let app=NSRunningApplication(processIdentifier:pid), app.bundleURL?.path=="/Applications/IINA.app" else { exit(2) }
func attr(_ e:AXUIElement,_ n:String)->CFTypeRef? { var v:CFTypeRef?;AXUIElementSetMessagingTimeout(e,1.0);let r=AXUIElementCopyAttributeValue(e,n as CFString,&v);if r != .success && n=="AXWindows" { print("AXWindows error: \(r.rawValue)") };return r == .success ? v:nil }
func str(_ e:AXUIElement,_ n:String)->String { attr(e,n) as? String ?? "" }
func children(_ e:AXUIElement)->[AXUIElement] { attr(e,"AXChildren") as? [AXUIElement] ?? [] }
let root=AXUIElementCreateApplication(pid)
var windows=[AXUIElement]()
for _ in 0..<4 { windows=(attr(root,"AXWindows") as? [AXUIElement] ?? []).filter { str($0,"AXTitle").contains(a[1]) };if windows.count==1 { break };Thread.sleep(forTimeInterval:0.2) }
guard windows.count==1 else { print("Window matches: \(windows.count)");exit(3) }
var queue:[(AXUIElement,Int,Bool)]=[(windows[0],0,false)],i=0,matches=[AXUIElement]()
while i<queue.count && i<1500 { let(e,d,inside)=queue[i];i+=1;let role=str(e,"AXRole");let allowedRole=role=="AXButton" || (["Chat","Playback"].contains(a[2]) && role=="AXRadioButton");if inside && allowedRole && str(e,"AXTitle")==a[2] {matches.append(e)};if d<16 {queue += children(e).map{($0,d+1,inside || role=="AXWebArea")} } }
guard matches.count==1 else { print("Web button not unique");exit(4) }
let start=ISO8601DateFormatter().string(from:Date());let result=AXUIElementPerformAction(matches[0],"AXPress" as CFString)
let record:[String:Any]=["pid":pid,"window":a[1],"button":a[2],"beforeUTC":start,"afterUTC":ISO8601DateFormatter().string(from:Date()),"AXResult":result.rawValue,"normalNativeWebButton":true]
print(String(decoding:try JSONSerialization.data(withJSONObject:record,options:[.sortedKeys]),as:UTF8.self));exit(result == .success ? 0:5)
