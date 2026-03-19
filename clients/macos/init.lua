local API_ENDPOINT = "http://127.0.0.1:8765/v1/rewrite"
local COPY_TIMEOUT_SECONDS = 1.0
local REQUEST_TIMEOUT_SECONDS = 15
local RESTORE_DELAY_SECONDS = 0.2
local SELECT_ALL_TO_COPY_DELAY_SECONDS = 0.05
local DEFAULT_TARGET_LANGUAGE = "en"
local HOTKEY_MODIFIERS = {"cmd", "shift"}

local MODES = {
  normal = {
    id = "normal",
    hotkey = "L",
    style = "prompt-professional",
    startMessage = "Normal rewrite started. Please wait...",
    successMessage = "Prompt rewritten",
  },
  initialRoleFirst = {
    id = "initial-role-first",
    hotkey = "K",
    style = "role-first-initial",
    startMessage = "Initial role-first rewrite started. Please wait...",
    successMessage = "Role-first prompt rewritten",
  },
  markedSegmentEdit = {
    id = "marked-segment-edit",
    hotkey = "J",
    style = "marked-segment-edit",
    startMessage = "Marked-segment rewrite started. Please wait...",
    successMessage = "Marked segments rewritten",
  },
}

local rewriteInProgress = false
local activeProgressAlert = nil

local function showAlert(message)
  hs.alert.show(message)
end

local function showProgressAlert(message)
  if activeProgressAlert then
    pcall(hs.alert.closeSpecific, activeProgressAlert, 0)
    activeProgressAlert = nil
  end

  activeProgressAlert = hs.alert.show(message, nil, nil, REQUEST_TIMEOUT_SECONDS + 2)
end

local function hideProgressAlert()
  if not activeProgressAlert then
    return
  end

  pcall(hs.alert.closeSpecific, activeProgressAlert, 0)
  activeProgressAlert = nil
end

local function snapshotClipboard()
  return {
    data = hs.pasteboard.readAllData(),
    text = hs.pasteboard.getContents(),
  }
end

local function prepareClipboardSentinel()
  local sentinel = string.format("__PROMPT_REWRITER_SENTINEL__%.6f__", hs.timer.secondsSinceEpoch())
  hs.pasteboard.setContents(sentinel)
  return sentinel
end

local function requestCopiedText(selectAllFirst, callback)
  local sentinel = prepareClipboardSentinel()

  hs.pasteboard.callbackWhenChanged(COPY_TIMEOUT_SECONDS, function(changed)
    if not changed then
      callback(nil)
      return
    end

    local copiedText = hs.pasteboard.getContents() or ""
    if copiedText == sentinel or copiedText:gsub("%s", "") == "" then
      callback(nil)
      return
    end

    callback(copiedText)
  end)

  if selectAllFirst then
    hs.eventtap.keyStroke({"cmd"}, "a", 0)
    hs.timer.doAfter(SELECT_ALL_TO_COPY_DELAY_SECONDS, function()
      hs.eventtap.keyStroke({"cmd"}, "c", 0)
    end)
    return
  end

  hs.eventtap.keyStroke({"cmd"}, "c", 0)
end

local function restoreClipboard(snapshot)
  if not snapshot then
    return
  end

  if type(snapshot.data) == "table" and next(snapshot.data) ~= nil then
    if hs.pasteboard.writeAllData(snapshot.data) then
      return
    end
  end

  if snapshot.text ~= nil then
    hs.pasteboard.setContents(snapshot.text)
    return
  end

  hs.pasteboard.clearContents()
end

local function finishWithFailure(snapshot, message)
  restoreClipboard(snapshot)
  rewriteInProgress = false
  hideProgressAlert()
  showAlert(message)
end

local function parseRewriteResponse(status, body)
  if status ~= 200 then
    local decodedError = hs.json.decode(body or "")
    if type(decodedError) == "table" and type(decodedError.error) == "string" then
      return nil, decodedError.error
    end

    return nil, "Rewrite failed: HTTP " .. tostring(status)
  end

  local decoded = hs.json.decode(body or "")
  if type(decoded) ~= "table" or type(decoded.text) ~= "string" then
    return nil, "Rewrite returned invalid JSON"
  end

  local rewrittenText = decoded.text:gsub("^%s+", ""):gsub("%s+$", "")
  if rewrittenText == "" then
    return nil, "Rewrite returned empty text"
  end

  return rewrittenText, nil
end

local function pasteReplacement(rewrittenText, snapshot, targetApp, modeConfig)
  if targetApp and targetApp:isRunning() then
    targetApp:activate()
  end

  hs.pasteboard.setContents(rewrittenText)
  hs.eventtap.keyStroke({"cmd"}, "v", 0)

  hs.timer.doAfter(RESTORE_DELAY_SECONDS, function()
    restoreClipboard(snapshot)
    rewriteInProgress = false
    hideProgressAlert()
    showAlert(modeConfig.successMessage)
  end)
end

local function requestRewrite(text, snapshot, targetApp, modeConfig)
  local payload = hs.json.encode({
    text = text,
    mode = modeConfig.id,
    style = modeConfig.style,
    targetLanguage = DEFAULT_TARGET_LANGUAGE,
  })

  if not payload then
    finishWithFailure(snapshot, "Failed to encode rewrite request")
    return
  end

  local requestFinished = false
  local headers = {
    ["Content-Type"] = "application/json",
    ["Accept"] = "application/json",
  }

  local timeoutTimer = hs.timer.doAfter(REQUEST_TIMEOUT_SECONDS, function()
    if requestFinished then
      return
    end

    requestFinished = true
    finishWithFailure(snapshot, "Rewrite timed out")
  end)

  hs.http.asyncPost(API_ENDPOINT, payload, headers, function(status, body, _responseHeaders)
    if requestFinished then
      return
    end

    requestFinished = true
    timeoutTimer:stop()

    local rewrittenText, errorMessage = parseRewriteResponse(status, body)
    if not rewrittenText then
      finishWithFailure(snapshot, errorMessage)
      return
    end

    pasteReplacement(rewrittenText, snapshot, targetApp, modeConfig)
  end)
end

local function rewriteSelection(modeConfig)
  if rewriteInProgress then
    showAlert("Rewrite already in progress")
    return
  end

  rewriteInProgress = true
  showProgressAlert(modeConfig.startMessage)

  local snapshot = snapshotClipboard()
  local targetApp = hs.application.frontmostApplication()

  requestCopiedText(false, function(selectedText)
    if selectedText then
      requestRewrite(selectedText, snapshot, targetApp, modeConfig)
      return
    end

    requestCopiedText(true, function(fullText)
      if fullText then
        requestRewrite(fullText, snapshot, targetApp, modeConfig)
        return
      end

      finishWithFailure(snapshot, "No selected text and could not capture the full text box")
    end)
  end)
end

hs.hotkey.bind(HOTKEY_MODIFIERS, MODES.normal.hotkey, function()
  rewriteSelection(MODES.normal)
end)

hs.hotkey.bind(HOTKEY_MODIFIERS, MODES.initialRoleFirst.hotkey, function()
  rewriteSelection(MODES.initialRoleFirst)
end)

hs.hotkey.bind(HOTKEY_MODIFIERS, MODES.markedSegmentEdit.hotkey, function()
  rewriteSelection(MODES.markedSegmentEdit)
end)
