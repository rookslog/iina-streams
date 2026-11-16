import Cocoa
import CoreGraphics
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []
let rows = windows.filter { ($0[kCGWindowOwnerName as String] as? String ?? "") == "IINA" && ($0[kCGWindowLayer as String] as? Int ?? 0) == 0 }.map { d in
 ["id":d[kCGWindowNumber as String] ?? 0,"pid":d[kCGWindowOwnerPID as String] ?? 0,"title":d[kCGWindowName as String] ?? "","bounds":d[kCGWindowBounds as String] ?? [:]]
}
print(String(data:try JSONSerialization.data(withJSONObject:rows,options:[.prettyPrinted,.sortedKeys]),encoding:.utf8)!)
