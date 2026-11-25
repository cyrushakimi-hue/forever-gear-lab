-- Gear Lab Export: saves an export of each character automatically, and /gearlab shows it as text to copy
-- (gear with exact stats, character sheet, talents) for the Forever Gear Lab site.
-- Every game call is wrapped, so a missing function on this client cannot break the export.

local SLOTS = {
  { 1, "Head" }, { 2, "Neck" }, { 3, "Shoulder" }, { 15, "Back" }, { 5, "Chest" }, { 9, "Wrist" },
  { 10, "Hands" }, { 6, "Waist" }, { 7, "Legs" }, { 8, "Feet" }, { 11, "Finger1" }, { 12, "Finger2" },
  { 13, "Trinket1" }, { 14, "Trinket2" }, { 16, "MainHand" }, { 17, "OffHand" }, { 18, "Ranged" },
}

local tip = CreateFrame("GameTooltip", "GearLabExportScanTip", nil, "GameTooltipTemplate")
tip:SetOwner(WorldFrame, "ANCHOR_NONE")

local function clean(s)
  s = tostring(s or "")
  s = s:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|T.-|t", ""):gsub("|A.-|a", "")
  return s
end

local function esc(s)
  s = clean(s)
  s = s:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("[%c]", " ")
  return s
end

local function num(v)
  v = tonumber(v)
  if not v then return "null" end
  if v == math.floor(v) then return string.format("%d", v) end
  return string.format("%.2f", v)
end

-- Tooltip lines that carry numbers the site needs: stats, damage, speed, armor, equip and proc effects.
local function wanted(line)
  if line:find("^%+%d") or line:find("^Equip:") or line:find("^Chance on hit") then return true end
  if line:find("Damage") or line:find("Armor") or line:find("damage per second") then return true end
  return false
end

local function tooltipLines(slotId)
  local lines = {}
  tip:SetOwner(WorldFrame, "ANCHOR_NONE")
  tip:ClearLines()
  local ok = pcall(tip.SetInventoryItem, tip, "player", slotId)
  if not ok then return lines end
  for i = 2, tip:NumLines() do
    local l = _G["GearLabExportScanTipTextLeft" .. i]
    local r = _G["GearLabExportScanTipTextRight" .. i]
    local lt = l and l:GetText()
    local rt = r and r:IsShown() and r:GetText()
    if lt and lt ~= "" then
      local line = clean(rt and (lt .. " | " .. rt) or lt)
      if wanted(line) then lines[#lines + 1] = line end
    end
  end
  return lines
end

local function linkParts(link)
  local body = link and link:match("item:([%-%d:]+)")
  local parts = {}
  if body then
    for field in (body .. ":"):gmatch("([^:]*):") do parts[#parts + 1] = field end
  end
  return parts
end

local function itemJson(slotId, label)
  local link = GetInventoryItemLink("player", slotId)
  if not link then return nil end
  local parts = linkParts(link)
  local id = tonumber(parts[1])
  if not id then return nil end
  local name = link:match("%[(.-)%]")
  local bonus = {}
  local count = tonumber(parts[13]) or 0
  for i = 1, count do
    local b = tonumber(parts[13 + i])
    if b then bonus[#bonus + 1] = num(b) end
  end
  local lines = {}
  for _, line in ipairs(tooltipLines(slotId)) do lines[#lines + 1] = '"' .. esc(line) .. '"' end
  return string.format('{"slot":"%s","id":%s,"enchant":%s,"suffix":%s,"bonus":[%s],"name":"%s","lines":[%s]}',
    label, num(id), num(tonumber(parts[2]) or 0), num(tonumber(parts[7]) or 0), table.concat(bonus, ","), esc(name), table.concat(lines, ","))
end

local function try(fn, ...)
  local ok, a, b, c = pcall(fn, ...)
  if ok then return a, b, c end
  return nil
end

local function sheetJson()
  local out = {}
  local names = { "str", "agi", "sta", "int", "spi" }
  for i, key in ipairs(names) do
    local _, effective = try(UnitStat, "player", i)
    if effective then out[#out + 1] = string.format('"%s":%s', key, num(effective)) end
  end
  local base, pos, neg = try(UnitAttackPower, "player")
  if base then out[#out + 1] = '"ap":' .. num((base or 0) + (pos or 0) + (neg or 0)) end
  local crit = GetCritChance and try(GetCritChance)
  if crit then out[#out + 1] = '"crit":' .. num(crit) end
  local spellCrit = GetSpellCritChance and try(GetSpellCritChance, 4)
  if spellCrit then out[#out + 1] = '"spellCrit":' .. num(spellCrit) end
  local spellDmg = GetSpellBonusDamage and try(GetSpellBonusDamage, 4)
  if spellDmg then out[#out + 1] = '"spellDmg":' .. num(spellDmg) end
  local hit = GetHitModifier and try(GetHitModifier)
  if hit then out[#out + 1] = '"hit":' .. num(hit) end
  local hp = try(UnitHealthMax, "player")
  if hp then out[#out + 1] = '"health":' .. num(hp) end
  local mana = try(UnitPowerMax, "player", 0)
  if mana then out[#out + 1] = '"mana":' .. num(mana) end
  return "{" .. table.concat(out, ",") .. "}"
end

local function traitsJson()
  local out = {}
  pcall(function()
    if not (C_ClassTalents and C_ClassTalents.GetActiveConfigID and C_Traits) then return end
    local configID = C_ClassTalents.GetActiveConfigID()
    if not configID then return end
    local cfg = C_Traits.GetConfigInfo(configID)
    for _, treeID in ipairs(cfg and cfg.treeIDs or {}) do
      for _, nodeID in ipairs(C_Traits.GetTreeNodes(treeID) or {}) do
        local node = C_Traits.GetNodeInfo(configID, nodeID)
        if node and node.activeRank and node.activeRank > 0 then
          local entryID = (node.activeEntry and node.activeEntry.entryID) or (node.entryIDs and node.entryIDs[1])
          local entry = entryID and C_Traits.GetEntryInfo(configID, entryID)
          local def = entry and entry.definitionID and C_Traits.GetDefinitionInfo(entry.definitionID)
          local spellID = def and (def.spellID or def.overriddenSpellID)
          if spellID then out[#out + 1] = string.format('{"spell":%s,"rank":%s}', num(spellID), num(node.activeRank)) end
        end
      end
    end
  end)
  if #out == 0 then
    -- Older talent functions, in case this client still has them.
    pcall(function()
      if not GetNumTalentTabs then return end
      for tab = 1, (GetNumTalentTabs() or 0) do
        for i = 1, (GetNumTalents(tab) or 0) do
          local name, _, _, _, rank = GetTalentInfo(tab, i)
          if name and rank and rank > 0 then out[#out + 1] = string.format('{"name":"%s","rank":%s}', esc(name), num(rank)) end
        end
      end
    end)
  end
  return "[" .. table.concat(out, ",") .. "]"
end

local function buildExport()
  local name = UnitName("player") or "?"
  local _, class = UnitClass("player")
  local _, race = UnitRace("player")
  local items = {}
  for _, s in ipairs(SLOTS) do
    local ok, json = pcall(itemJson, s[1], s[2])
    if ok and json then items[#items + 1] = json end
  end
  return string.format('{"fgx":1,"name":"%s","realm":"%s","class":"%s","race":"%s","level":%s,"money":%s,"items":[%s],"sheet":%s,"traits":%s}',
    esc(name), esc(GetRealmName and GetRealmName() or ""), esc(class), esc(race), num(UnitLevel("player")), num(GetMoney and GetMoney() or 0),
    table.concat(items, ","), sheetJson(), traitsJson())
end

-- A small window with the text selected, ready for Ctrl+C.
local frame, edit
local function showWindow(text)
  if not frame then
    local ok, f = pcall(CreateFrame, "Frame", "GearLabExportFrame", UIParent, "BasicFrameTemplateWithInset")
    if not ok or not f then
      f = CreateFrame("Frame", "GearLabExportFrame", UIParent)
      local bg = f:CreateTexture(nil, "BACKGROUND")
      bg:SetAllPoints(f)
      bg:SetColorTexture(0, 0, 0, 0.9)
    end
    frame = f
    f:SetSize(540, 300)
    f:SetPoint("CENTER")
    f:SetFrameStrata("DIALOG")
    f:SetMovable(true)
    f:EnableMouse(true)
    f:RegisterForDrag("LeftButton")
    f:SetScript("OnDragStart", f.StartMoving)
    f:SetScript("OnDragStop", f.StopMovingOrSizing)
    local title = f:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    title:SetPoint("TOP", 0, -6)
    title:SetText("Gear Lab export: press Ctrl+C, then Escape")
    local scroll = CreateFrame("ScrollFrame", "GearLabExportScroll", f, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 12, -32)
    scroll:SetPoint("BOTTOMRIGHT", -32, 12)
    edit = CreateFrame("EditBox", "GearLabExportEdit", scroll)
    edit:SetMultiLine(true)
    edit:SetFontObject(ChatFontNormal)
    edit:SetWidth(480)
    edit:SetAutoFocus(false)
    edit:SetMaxLetters(0)
    edit:SetScript("OnEscapePressed", function() f:Hide() end)
    scroll:SetScrollChild(edit)
  end
  edit:SetText(text)
  frame:Show()
  edit:SetFocus()
  edit:HighlightText()
end

-- Saves an export for every character you log in on, so the site can read them all from one file.
-- WoW writes this file to disk only on /reload or logout.
local function saveCharacter()
  local ok, text = pcall(buildExport)
  if not ok or not text then return end
  GearLabExportDB = GearLabExportDB or {}
  GearLabExportDB.chars = GearLabExportDB.chars or {}
  local key = (UnitName("player") or "?") .. "-" .. (GetRealmName and GetRealmName() or "")
  GearLabExportDB.chars[key] = text
  GearLabExportDB.last = text
  GearLabExportDB.time = time and time() or 0
end

local watcher = CreateFrame("Frame")
local pending = 0
watcher:SetScript("OnUpdate", function(_, elapsed)
  if pending > 0 then
    pending = pending - (elapsed or 0)
    if pending <= 0 then pending = 0; saveCharacter() end
  end
end)
watcher:SetScript("OnEvent", function(_, event)
  if event == "PLAYER_LOGOUT" then saveCharacter() else pending = 3 end
end)
for _, ev in ipairs({ "PLAYER_ENTERING_WORLD", "PLAYER_EQUIPMENT_CHANGED", "PLAYER_LEVEL_UP", "PLAYER_LOGOUT" }) do
  pcall(watcher.RegisterEvent, watcher, ev)
end

SLASH_GEARLAB1 = "/gearlab"
SLASH_GEARLAB2 = "/gearlabexport"
SlashCmdList["GEARLAB"] = function()
  local ok, text = pcall(buildExport)
  if not ok then
    print("|cffff5555Gear Lab Export:|r could not build the export: " .. tostring(text))
    return
  end
  saveCharacter()
  local shown, err = pcall(showWindow, text)
  if not shown then
    print("|cffff5555Gear Lab Export:|r could not open the window (" .. tostring(err) .. "). Type /reload, then find the text in WTF\\Account\\<account>\\SavedVariables\\GearLabExport.lua")
  else
    print("|cff66ccffGear Lab Export:|r press Ctrl+C to copy, or type /reload and press Sync on the site.")
  end
end
