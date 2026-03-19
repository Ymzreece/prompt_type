#Requires AutoHotkey v2.0
#SingleInstance Force

; Configure these if needed
apiEndpoint := "http://127.0.0.1:8765/rewrite"
; Default shortcut: Ctrl+Shift+R
; Change to "+Enter" if you want true Shift+Enter behavior.

^+r::RewriteSelection()

RewriteSelection() {
    global apiEndpoint

    ; Save clipboard
    originalClipboard := A_ClipboardAll
    A_Clipboard := ""

    ; Copy selected text (or current field text if no explicit selection)
    Send "^c"
    if !ClipWait(0.6) {
        A_Clipboard := originalClipboard
        return
    }

    selected := A_Clipboard
    if (Trim(selected) = "") {
        A_Clipboard := originalClipboard
        return
    }

    json := "{\"text\":\"" . EscapeJSON(selected) . "\",\"style\":\"prompt-like\"}"

    http := ComObject("WinHttp.WinHttpRequest.5.1")
    try {
        http.Open("POST", apiEndpoint, false)
        http.SetRequestHeader("Content-Type", "application/json")
        http.Send(json)

        if (http.Status != 200) {
            MsgBox("Rewrite failed (HTTP " . http.Status . "): " . http.ResponseText)
            A_Clipboard := originalClipboard
            return
        }

        rewritten := http.ResponseText
        A_Clipboard := rewritten
        Send "^v"
    } catch as err {
        MsgBox("Rewrite request failed: " . err.Message)
        A_Clipboard := originalClipboard
        return
    }

    ; Keep rewritten text in clipboard to allow paste after script closes.
    originalClipboard := ""
}

EscapeJSON(text) {
    text := StrReplace(text, "\\", "\\\\")
    text := StrReplace(text, "`r", "\\r")
    text := StrReplace(text, "`n", "\\n")
    text := StrReplace(text, '"', '\\"')
    text := StrReplace(text, "'", "\\'")
    text := StrReplace(text, "`t", "\\t")
    return text
}
