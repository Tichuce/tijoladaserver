import { LOG_PRESETS, coordinates, detailsText, emptyFilters, entityText, formatUtc, mapLabel, mapText, participantFilter, utcInputValue, } from "./logviewer.js";
function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className)
        e.className = className;
    if (text !== undefined)
        e.textContent = text;
    return e;
}
function button(text, onClick, className) {
    const b = el("button", className, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
}
function labelled(text, control) {
    const l = el("label", "field");
    l.append(el("span", undefined, text), control);
    return l;
}
export class LogView {
    constructor(state, actions, listId) {
        this.state = state;
        this.actions = actions;
        this.preset = el("select");
        this.customStart = el("input");
        this.customEnd = el("input");
        this.customRow = el("div", "log-custom");
        this.participant = el("input");
        this.map = el("input");
        this.mapList = el("datalist");
        this.text = el("input");
        this.typesSummary = el("summary");
        this.typesBody = el("div", "log-types-body");
        this.status = el("div", "log-status");
        this.formError = el("div", "log-form-error");
        this.tbody = el("tbody");
        this.detail = el("div", "log-detail");
        this.selectedTypes = new Set();
        this.typesKey = "";
        this.mapsKey = "";
        this.rangeApplied = false;
        this.shownVersion = -1;
        this.selected = -1;
        this.rows = [];
        this.root = el("section", "game-window log-viewer");
        this.root.dataset.frame = "29";
        this.handle = el("header");
        this.handle.append(el("span", "title", "GM Log Viewer"), button("×", () => this.actions.close(), "close"));
        this.handle.querySelector(".close").setAttribute("title", "Close");
        for (const [value, label] of LOG_PRESETS) {
            const o = el("option", undefined, label);
            o.value = value;
            this.preset.appendChild(o);
        }
        this.preset.value = "day";
        this.preset.addEventListener("change", () => this.syncCustom());
        for (const input of [this.customStart, this.customEnd])
            input.type = "datetime-local";
        this.customRow.append(labelled("From (UTC)", this.customStart), labelled("To (UTC)", this.customEnd));
        this.participant.placeholder = "Name or #id";
        this.participant.maxLength = 64;
        this.mapList.id = listId;
        this.map.setAttribute("list", listId);
        this.map.placeholder = "All maps (or #id)";
        this.text.placeholder = "Text contains…";
        this.text.maxLength = 4096;
        for (const input of [this.participant, this.map, this.text, this.customStart, this.customEnd]) {
            input.spellcheck = false;
            input.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    this.search();
                }
                ev.stopPropagation();
            });
        }
        const types = el("details", "log-types");
        types.append(this.typesSummary, this.typesBody);
        this.searchButton = button("Search", () => this.search(), "primary");
        const clear = button("Clear", () => this.clearFilters());
        const filters = el("div", "log-filters");
        filters.append(labelled("Time", this.preset), this.customRow, labelled("Participant", this.participant), labelled("Map", this.map), this.mapList, labelled("Text", this.text), types);
        const actionsRow = el("div", "log-actions");
        actionsRow.append(this.searchButton, clear, this.formError);
        const table = el("table", "log-table");
        const head = el("tr");
        for (const name of ["Time (UTC)", "Event", "Primary", "Related", "Map", "Summary"])
            head.appendChild(el("th", undefined, name));
        table.append(el("thead"), this.tbody);
        table.tHead.appendChild(head);
        const tableWrap = el("div", "log-table-wrap");
        tableWrap.appendChild(table);
        this.prevButton = button("◀ Previous", () => this.actions.page(false));
        this.nextButton = button("Next ▶", () => this.actions.page(true));
        const pager = el("div", "log-pager");
        pager.append(this.status, this.prevButton, this.nextButton);
        const results = el("div", "log-results");
        results.append(tableWrap, this.detail);
        const body = el("div", "body log-body");
        body.append(el("p", "log-note", "Times are UTC. Recent entries may be delayed by up to ten minutes."), filters, actionsRow, pager, results);
        this.root.append(this.handle, body);
        this.syncCustom();
        this.update();
    }
    update() {
        const s = this.state;
        this.syncMetadata();
        this.searchButton.disabled = !s.ready || s.busy;
        this.prevButton.disabled = !s.canPrevious;
        this.nextButton.disabled = !s.canNext;
        this.status.textContent = this.statusText();
        this.status.classList.toggle("error", s.status === "error");
        if (this.shownVersion === s.version)
            return;
        this.shownVersion = s.version;
        if (this.rows !== s.rows) {
            this.rows = s.rows;
            this.selected = -1;
            this.renderRows();
            this.renderDetail();
        }
    }
    filters() {
        return {
            preset: this.preset.value,
            customStart: this.customStart.value,
            customEnd: this.customEnd.value,
            participant: this.participant.value,
            map: this.map.value,
            typeIds: [...this.selectedTypes],
            text: this.text.value,
        };
    }
    statusText() {
        const s = this.state;
        if (s.status === "waiting")
            return "Loading filters…";
        if (s.status === "loading")
            return "Searching…";
        if (s.status === "error")
            return s.error;
        if (s.status === "idle")
            return "Choose filters and press Search.";
        const page = `page ${s.pageIndex + 1}`;
        const count = s.rows.length === 0 ? "No log entries match" : `Showing ${s.rows.length} entr${s.rows.length === 1 ? "y" : "ies"} (${page})`;
        return `${count}${s.hasMore ? ", more available" : ""}. ${s.applied}`;
    }
    search() {
        const error = this.actions.search(this.filters());
        this.formError.textContent = error ?? "";
    }
    clearFilters() {
        const f = emptyFilters();
        this.preset.value = f.preset;
        this.participant.value = "";
        this.map.value = "";
        this.text.value = "";
        this.selectedTypes.clear();
        this.applyRange();
        this.syncCustom();
        this.renderTypes();
        this.formError.textContent = "";
    }
    syncCustom() {
        this.customRow.hidden = this.preset.value !== "custom";
    }
    applyRange() {
        const range = this.state.defaultRange;
        if (!range)
            return;
        this.customStart.value = utcInputValue(range[0]);
        this.customEnd.value = utcInputValue(range[1]);
    }
    syncMetadata() {
        const s = this.state;
        if (s.defaultRange && !this.rangeApplied) {
            this.rangeApplied = true;
            this.applyRange();
        }
        const mapsKey = `${s.maps.size}`;
        if (mapsKey !== this.mapsKey) {
            this.mapsKey = mapsKey;
            this.mapList.replaceChildren(...[...s.maps].sort((a, b) => a[0] - b[0]).map(([id, name]) => {
                const o = el("option");
                o.value = mapLabel(id, name);
                return o;
            }));
        }
        const typesKey = `${s.types.size}`;
        if (typesKey !== this.typesKey) {
            this.typesKey = typesKey;
            this.renderTypes();
        }
    }
    renderTypes() {
        const s = this.state;
        const all = [...s.types.keys()];
        const chosen = all.filter((id) => this.selectedTypes.has(id)).length;
        this.typesSummary.textContent = chosen === 0 || chosen === all.length ? "Events: all" : `Events: ${chosen} selected`;
        this.typesBody.replaceChildren();
        for (const [group, types] of s.groups()) {
            const box = el("fieldset", "log-group");
            const legend = el("legend");
            const groupCheck = el("input");
            groupCheck.type = "checkbox";
            const picked = types.filter(([id]) => this.selectedTypes.has(id)).length;
            groupCheck.checked = picked === types.length;
            groupCheck.indeterminate = picked > 0 && picked < types.length;
            groupCheck.addEventListener("change", () => {
                for (const [id] of types) {
                    if (groupCheck.checked)
                        this.selectedTypes.add(id);
                    else
                        this.selectedTypes.delete(id);
                }
                this.renderTypes();
            });
            const legendLabel = el("label");
            legendLabel.append(groupCheck, document.createTextNode(` ${group}`));
            legend.appendChild(legendLabel);
            box.appendChild(legend);
            for (const [id, label] of types) {
                const check = el("input");
                check.type = "checkbox";
                check.checked = this.selectedTypes.has(id);
                check.addEventListener("change", () => {
                    if (check.checked)
                        this.selectedTypes.add(id);
                    else
                        this.selectedTypes.delete(id);
                    this.renderTypes();
                });
                const l = el("label", "log-type");
                l.append(check, document.createTextNode(` ${label}`));
                box.appendChild(l);
            }
            this.typesBody.appendChild(box);
        }
        if (all.length)
            this.typesBody.appendChild(button("Clear selection (all events)", () => {
                this.selectedTypes.clear();
                this.renderTypes();
            }, "log-types-clear"));
    }
    renderRows() {
        this.tbody.replaceChildren();
        this.rows.forEach((row, i) => {
            const tr = el("tr");
            tr.dataset.index = String(i);
            const cells = [formatUtc(row.utcMilliseconds), row.eventLabel, entityText(row.primary), entityText(row.related), mapText(row), row.summary];
            cells.forEach((text, c) => {
                const td = el("td", c === 5 ? "summary" : undefined, text);
                td.title = text;
                tr.appendChild(td);
            });
            tr.addEventListener("click", () => {
                this.selected = i;
                for (const other of this.tbody.children)
                    other.classList.toggle("selected", other === tr);
                this.renderDetail();
            });
            this.tbody.appendChild(tr);
        });
    }
    renderDetail() {
        const row = this.rows[this.selected];
        this.detail.replaceChildren();
        if (!row) {
            this.detail.appendChild(el("p", "log-placeholder", this.rows.length ? "Select an entry to see its details." : ""));
            return;
        }
        this.detail.appendChild(el("h4", undefined, row.summary));
        const dl = el("dl");
        const add = (term, value, quick) => {
            if (!value)
                return;
            const dd = el("dd", undefined, value);
            if (quick)
                dd.appendChild(quick);
            dl.append(el("dt", undefined, term), dd);
        };
        add("Time (UTC)", new Date(row.utcMilliseconds).toISOString().replace(/\.\d{3}Z$/, "Z"));
        add("Event", `${row.eventLabel} (type ${row.typeId}) · ${row.eventGroup}`, this.state.types.has(row.typeId) ? this.quick("Only this event", () => {
            this.selectedTypes.clear();
            this.selectedTypes.add(row.typeId);
            this.renderTypes();
        }) : null);
        this.addEntity(add, row.primary);
        this.addEntity(add, row.related);
        const map = mapText(row);
        const at = coordinates(row);
        add("Map", [map, at && `at ${at}`].filter(Boolean).join(" "), row.map?.canQuickFilter && row.map.id ? this.quick("Filter map", () => {
            this.map.value = this.state.maps.has(row.map.id) ? mapLabel(row.map.id, this.state.maps.get(row.map.id)) : `#${row.map.id}`;
        }) : null);
        add("Log row", String(row.rowId));
        this.detail.appendChild(dl);
        this.detail.appendChild(el("pre", "log-original", row.originalText));
        const copied = el("span", "log-copied");
        this.detail.appendChild(button("Copy details", () => {
            void copyText(detailsText(row)).then((ok) => {
                copied.textContent = ok ? "Copied" : "Copy failed";
            });
        }));
        this.detail.appendChild(copied);
    }
    addEntity(add, e) {
        if (!e)
            return;
        const filter = participantFilter(e);
        add(e.label, `${entityText(e) || "-"} · ${e.kind}`, filter ? this.quick("Filter participant", () => {
            this.participant.value = filter;
        }) : null);
    }
    quick(text, onClick) {
        return button(text, () => {
            onClick();
            this.formError.textContent = "Filter updated; press Search to apply.";
        }, "log-quick");
    }
}
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
    }
}
