/**
 * Minimal Server-Sent-Events line parser for the `ai-chat` stream.
 * Feed it raw text chunks as they arrive; it returns the complete events and
 * keeps any partial line buffered for the next chunk.
 *
 * Wire format (one JSON object per `data:` line, events separated by a blank line):
 *   event: delta
 *   data: {"text":"..."}
 */
export interface SseEvent {
  event: string;
  data: unknown;
}

export class SseParser {
  private buffer = "";
  private event = "message";
  private dataLines: string[] = [];

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      let line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      if (line === "") {
        const ev = this.flush();
        if (ev) out.push(ev);
        continue;
      }
      if (line.startsWith(":")) continue; // comment / keep-alive
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") this.event = value || "message";
      else if (field === "data") this.dataLines.push(value);
    }
    return out;
  }

  /** Flush a trailing event that was not followed by a blank line (stream end). */
  end(): SseEvent[] {
    const ev = this.flush();
    return ev ? [ev] : [];
  }

  private flush(): SseEvent | null {
    if (!this.dataLines.length) {
      this.event = "message";
      return null;
    }
    const raw = this.dataLines.join("\n");
    this.dataLines = [];
    const event = this.event;
    this.event = "message";
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // keep raw string
    }
    return { event, data };
  }
}
