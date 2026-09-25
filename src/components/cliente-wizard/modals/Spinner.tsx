import { createPortal } from "react-dom"
import { Loader2 } from "lucide-react"

export const Spinner =()=>{
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    </div>,
    document.body
  )
}
