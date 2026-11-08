// QA-only closure by exact observed title AND frame, preserving all other AX identities.
import Cocoa
import ApplicationServices
let a=Array(CommandLine.arguments.dropFirst())
guard a.count==6,let pid=Int32(a[0]),let app=NSRunningApplication(processIdentifier:pid),app.bundleURL?.path=="/Applications/IINA.app",AXIsProcessTrusted() else {exit(2)}
let targetFrame=a[2...5].compactMap(Double.init);guard targetFrame.count==4 else{exit(2)}
let root=AXUIElementCreateApplication(pid)
func attr(_ e:AXUIElement,_ n:String)->CFTypeRef?{var v:CFTypeRef?;AXUIElementSetMessagingTimeout(e,1);return AXUIElementCopyAttributeValue(e,n as CFString,&v) == .success ? v:nil}
func title(_ e:AXUIElement)->String{attr(e,"AXTitle") as? String ?? ""}
func windows()->[AXUIElement]?{attr(root,"AXWindows") as? [AXUIElement]}
func frame(_ e:AXUIElement)->[Double]?{guard let p=attr(e,"AXPosition"),let s=attr(e,"AXSize"),CFGetTypeID(p)==AXValueGetTypeID(),CFGetTypeID(s)==AXValueGetTypeID() else{return nil};var point=CGPoint.zero,size=CGSize.zero;guard AXValueGetValue(unsafeBitCast(p,to:AXValue.self),.cgPoint,&point),AXValueGetValue(unsafeBitCast(s,to:AXValue.self),.cgSize,&size) else{return nil};return [point.x,point.y,size.width,size.height]}
guard let before=windows() else{exit(3)}
let matches=before.filter{title($0)==a[1] && frame($0)==targetFrame};guard matches.count==1 else{print("Exact owned frame/title not unique");exit(4)}
let target=matches[0],others=before.filter{!CFEqual($0,target)}
guard let raw=attr(target,"AXCloseButton"),CFGetTypeID(raw)==AXUIElementGetTypeID() else{exit(5)}
let button=unsafeBitCast(raw,to:AXUIElement.self)
guard attr(button,"AXSubrole") as? String == "AXCloseButton",let owner=attr(button,"AXWindow"),CFEqual(owner,target) else{exit(6)}
let start=ISO8601DateFormatter().string(from:Date());let code=AXUIElementPerformAction(button,"AXPress" as CFString)
var absent=false,preserved=false
for _ in 0..<30{if let after=windows(){absent = !after.contains{CFEqual($0,target)};preserved=others.allSatisfy{o in after.contains{CFEqual(o,$0)}};if absent && preserved{break}};Thread.sleep(forTimeInterval:0.1)}
let result:[String:Any]=["pid":pid,"title":a[1],"frame":targetFrame,"beforeUTC":start,"afterUTC":ISO8601DateFormatter().string(from:Date()),"AXResult":code.rawValue,"closeButtonAXWindowEqualsTarget":true,"targetAbsent":absent,"allOtherNativeWindowIdentitiesPreserved":preserved,"ok":absent && preserved]
print(String(decoding:try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]),as:UTF8.self));exit(absent && preserved ? 0:7)
