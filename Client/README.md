# Client

Aspereta game client source, kept separate from the server (`Goose/`, `Goose.sln`).
Nothing in this folder is part of the server build.

## What this is

`gooseclient/` is **okonk's C# rewrite of the Aspereta client** ("Custom client for Aspereta"),
imported from https://github.com/okonk/gooseclient at commit
`e15fcb413dc0645dad14c76fd18345bff511ad9e` (2024-05-25). License: BSD 2-Clause (`gooseclient/LICENSE`).

It is **not** the original Visual Basic 6 client (`AsperetaCS-1.8`). That source is not publicly
available; the `AspGame.exe` you play with today was built from it.

It uses the same data files and folder layout as the original client, and the same server protocol:

| Reads | From |
|---|---|
| `Game.ini`, `serverinfo.ini` | client folder |
| `skins/<Skin>/Window.ini`, `Button.ini` | `skins/` |
| `data/*.adf`, `data/compiled.enc` | `data/` |
| `maps/MapN.map` | `maps/` |
| `user/<realm>-<name>.ini` | `user/` |

## Installed copy (the one you play)

`install-client.bat` builds the client (Release, win-x64) and installs it into the Aspereta game folder
(`Asperetinha\Aspereta`, or `GAME_DIR`) next to `AspGame.exe`. Run it again after changing the source.

- It never overwrites the game's own files. `AspGame.exe` keeps working as before.
- Both clients share `data\`, `maps\`, `skins\`, `user\`, `Game.ini` and `serverinfo.ini`.
- It adds `[LoginScreen]` to each skin's `Window.ini` (AspGame ignores it). Originals are kept as
  `Window.ini.before-new-client` and `Game.ini.before-new-client`.
- Start it with the `Aspereta (novo cliente)` shortcut on the Desktop, or `AsperetaClient.exe` in the game folder.
- It is a Windows app (`WinExe`), so no console window opens. Its log messages are not shown anywhere; run it
  from a terminal with output redirected (`AsperetaClient.exe > log.txt`) if you need them.

## Build and run

Double-click `run-client.bat` (or run it from a terminal). It:

1. builds `gooseclient/AsperetaClient` (Debug, .NET 10);
2. copies the build output into `Client/run/`;
3. the first time only, copies `data/`, `maps/`, `skins/`, `user/`, `Game.ini`, `serverinfo.ini` and
   `backdrop.bmp` from your Aspereta client folder (`..\..\Aspereta` by default, or set `GAME_DATA`);
4. adds the `[LoginScreen]` section from `skin-loginscreen.ini` to each skin's `Window.ini`;
5. starts `AsperetaClient.exe`.

`run-client.bat --no-start` does steps 1 to 4 only. `Client/run/` is ignored by git, and your settings
there (`Game.ini`, `user/*.ini`) are kept between runs. The client connects to the IP and port in
`Client/run/serverinfo.ini` (127.0.0.1:2006 by default).

Manual build: `dotnet build Client\gooseclient\AsperetaClient\AsperetaClient.csproj -c Debug`
(output in `AsperetaClient\bin\Debug\net10.0\`, which also gets `SDL2.dll` and `SDL2_image.dll`).

## Requirements

- .NET 10 SDK (the same one the server uses).
- NuGet packages restore automatically: ClosedXML, Microsoft.CodeAnalysis.CSharp.Scripting,
  System.Data.SQLite.Core.
- `gooseclient/libs/` holds `SDL2.dll`, `SDL2_image.dll` (64-bit Windows) and a prebuilt `CsvToSql.Core.dll`.
- `SDL2_gfx` has bindings in `SDL2/SDL2_gfx.cs` but is never called, so no DLL is needed.
- `build.sh` is okonk's Linux release script with his own paths; it won't run as-is on Windows.

## Changes from upstream

| File | Change | Why |
|---|---|---|
| `AsperetaClient.csproj` | `net8` → `net10.0`; removed `RuntimeIdentifiers`; `System.Data.SQLite` → `System.Data.SQLite.Core` 1.0.119; copies the SDL DLLs to the output | Only .NET 10 is installed; the RID list made each restore download runtimes for 4 platforms (~8 min); the full SQLite package pulled in EntityFramework and vulnerable SqlClient |
| `Scripting/ScriptManager.cs` | No `Scripts` folder = no scripts | It crashed at startup without the folder |
| `GameGUI/CharacterWindow.cs`, `ContainerWindow.cs`, `InventoryWindow.cs`, `SpellbookWindow.cs` | Ignore slot numbers the skin doesn't have | This server sends more equipment slots than the skin's 13 (e.g. mount), which crashed the character window |
| `NetworkClient.cs` | An error in one packet is logged and skipped | One bad packet used to drop the whole connection |
| `Map.cs` | Mouse-over does nothing until the map has loaded | Crashed when the map was only partly loaded |
| `GameScreen.cs` | One-tile position updates (SUP) walk instead of jump while auto-hunt is ON, paced to the server's step rate | Auto-hunt steps used to look like teleports |
| `AutoHuntTracker.cs`, `GameGUI/AutoHuntWindow.cs` (new) | ON / PAUSED / OFF auto-hunt button | See below |
| `AsperetaClient.csproj` | `OutputType` `Exe` → `WinExe` | No console window next to the game |
| `GameGUI/HotkeyBarWindow.cs` | Skills (hotkey) bar reads/saves its position under AspGame's `[HotButton]` section | The skin calls it `[HotButtons]`, so the bar always started hidden |
| `ConnectingWindow.cs` | First login starts from AspGame's `user/<name>-<realm>.ini` when there is one | Your skills and window layout carry over from AspGame |
| `GUIElements/BaseWindow.cs` | Saving a window whose section is missing creates it | Closing the game used to crash before anything was saved |

## Auto-hunt button

A small button in the top-right of the game screen shows the server's auto-hunt state:
green **ON**, blinking yellow **PAUSED**, grey **OFF**.

- Left click: OFF → ON, ON → PAUSED, PAUSED → ON. Right click: OFF.
- Drag it to move it; F10 hides or shows it. Its position is saved per character.
- The button only sends `/autohunt on|pause|off`. It changes colour when the server's reply arrives
  ("Auto-hunt started/resumed/paused/stopped…"); the light is hollow while it waits. So it also follows
  stops the server makes on its own (low HP, a vendor, moving, changing maps) and `/autohunt` typed in chat.
- PAUSED keeps the session: you can walk, heal or trade without it ending. Resuming hunts around where you
  are standing then.

## Known gaps

- Packets the server sends that this client ignores (logged as "Can't handle packet"): `CHI`, `SINVS`, `MFL`.
- Client settings files are named `user/<realm>-<name>.ini` (AspGame uses `<name>-<realm>.ini`). On a
  character's first login here, its AspGame file is copied; after that the two clients keep separate files.
- The buff bar has the same section-name mismatch (`[SpellEffect]` vs `[SpellEffects]`) and still starts hidden; F3 shows it.
- Optional client scripts (`Scripts/*.csx`) need `AsperetaGoose.db` next to the exe; without it the client
  tries to download okonk's data sheet from Google.
- `todo-aspereta.txt` lists features okonk hadn't finished.
- The game data is not committed here: it is the original game's art and maps.
