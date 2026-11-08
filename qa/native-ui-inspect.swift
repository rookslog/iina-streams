// Read-only, bounded native AX observation for the normal archive acceptance run.
import Cocoa
import ApplicationServices
let args = Array(CommandLine.arguments.dropFirst())
guard args.count == 2, let pid = Int32(args[0]), let app = NSRunningApplication(processIdentifier: pid), app.bundleURL?.path == "/Applications/IINA.app" else { exit(2) }
let root = AXUIElementCreateApplication(pid)
let deadline = ProcessInfo.processInfo.systemUptime + 8
var readErrors=[String:Int]()
func attr(_ e: AXUIElement, _ n: String) -> CFTypeRef? { guard ProcessInfo.processInfo.systemUptime < deadline else {return nil};var v: CFTypeRef?; AXUIElementSetMessagingTimeout(e, n=="AXWindows" ? 2.0:0.5);let code=AXUIElementCopyAttributeValue(e,n as CFString,&v);if code != .success {readErrors[n+":"+String(code.rawValue),default:0]+=1};return code == .success ? v:nil }
func str(_ e: AXUIElement, _ n: String) -> String { String((attr(e,n) as? String ?? "").prefix(180)) }
func es(_ v: CFTypeRef?) -> [AXUIElement] { v as? [AXUIElement] ?? [] }
func point(_ e: AXUIElement, _ n: String) -> [Double]? { guard let v=attr(e,n), CFGetTypeID(v)==AXValueGetTypeID() else { return nil }; let a=unsafeBitCast(v,to:AXValue.self); if n=="AXPosition" { var p=CGPoint.zero; if AXValueGetValue(a,.cgPoint,&p) { return [p.x,p.y] } } else { var s=CGSize.zero; if AXValueGetValue(a,.cgSize,&s) { return [s.width,s.height] } }; return nil }
let ws=es(attr(root,"AXWindows")).filter { args[1]=="*" || str($0,"AXTitle").contains(args[1]) }
var results=[[String:Any]]()
for w in ws { var q:[(AXUIElement,Int)]=[(w,0)],i=0; while i<q.count && i<1500 { let (e,d)=q[i];i+=1; var row:[String:Any]=["depth":d,"role":str(e,"AXRole"),"title":str(e,"AXTitle"),"description":str(e,"AXDescription"),"value":str(e,"AXValue")]; row["position"]=point(e,"AXPosition");row["size"]=point(e,"AXSize"); if let n=attr(e,"AXValue") as? NSNumber { row["numericValue"]=n }; results.append(row);if d<16 { q += (es(attr(e,"AXChildren"))+es(attr(e,"AXSheets"))).map{($0,d+1)} } } }
let result:[String:Any]=["timeUTC":ISO8601DateFormatter().string(from:Date()),"pid":pid,"windowMatches":ws.count,"elements":results,"readErrors":readErrors,"withinDeadline":ProcessInfo.processInfo.systemUptime<deadline]
print(String(decoding:try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]),as:UTF8.self))
