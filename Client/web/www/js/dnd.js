// Drag-and-drop payloads shared by the side panels, server windows, hotkey bar and map.
const MIME = "application/x-aspereta";
export function setDrag(ev, payload) {
    ev.dataTransfer?.setData(MIME, JSON.stringify(payload));
    // Some browsers only start a drag with a text/plain payload.
    ev.dataTransfer?.setData("text/plain", JSON.stringify(payload));
    if (ev.dataTransfer)
        ev.dataTransfer.effectAllowed = "move";
}
export function getDrag(ev) {
    const raw = ev.dataTransfer?.getData(MIME) || ev.dataTransfer?.getData("text/plain");
    if (!raw)
        return null;
    try {
        const p = JSON.parse(raw);
        if (p && (p.type === "item" || p.type === "spell"))
            return p;
    }
    catch { /* not ours */ }
    return null;
}
/** Makes an element accept drops; the handler gets the payload and whether Ctrl was held. */
export function dropTarget(el, onDrop) {
    el.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        el.classList.add("drop-hover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-hover"));
    el.addEventListener("drop", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        el.classList.remove("drop-hover");
        const payload = getDrag(ev);
        if (payload)
            onDrop(payload, ev.ctrlKey);
    });
}
