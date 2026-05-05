/**
 * Synthetic M365 Fixture Factory
 *
 * Generates mock Calendar, WorkIQ, Teams, and Mail responses.
 */

export interface CalendarEvent {
  subject: string;
  start: string;
  end: string;
  organizer: string;
}

export interface WorkIqResult {
  type: "Event" | "ChatMessage" | "Email";
  subject: string;
  preview: string;
  date: string;
}

export interface M365FixtureSet {
  "calendar-today.json": { value: CalendarEvent[] };
  "workiq-meetings.json": { results: WorkIqResult[] };
}

function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19);
}

function recentDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export class M365FixtureFactory {
  #events: CalendarEvent[] = [];
  #workiqResults: WorkIqResult[] = [];

  addMeeting(overrides: Partial<CalendarEvent> = {}): this {
    const idx = this.#events.length + 1;
    this.#events.push({
      subject: `Meeting ${idx}`,
      start: todayAt(9 + idx),
      end: todayAt(10 + idx),
      organizer: "organizer@example.com",
      ...overrides,
    });
    return this;
  }

  addWorkIqResult(overrides: Partial<WorkIqResult> = {}): this {
    this.#workiqResults.push({
      type: "Event",
      subject: "Meeting",
      preview: "Discussion notes",
      date: recentDate(1),
      ...overrides,
    });
    return this;
  }

  // ── Presets ─────────────────────────────────────────────────────────────

  static standard(): M365FixtureFactory {
    return new M365FixtureFactory()
      .addMeeting({
        subject: "Contoso — Weekly Architecture Review",
        start: todayAt(9),
        end: todayAt(10),
        organizer: "sarachen@contoso.com",
      })
      .addMeeting({
        subject: "Pipeline Review — Azure Migration Deals",
        start: todayAt(14),
        end: todayAt(15),
        organizer: "mikej@microsoft.com",
      })
      .addWorkIqResult({
        type: "Event",
        subject: "Contoso — Weekly Architecture Review",
        preview: "Discussed landing zone topology.",
        date: recentDate(7),
      })
      .addWorkIqResult({
        type: "ChatMessage",
        subject: "Contoso Migration Thread",
        preview: "Firewall rule changes approved.",
        date: recentDate(1),
      });
  }

  static empty(): M365FixtureFactory {
    return new M365FixtureFactory();
  }

  build(): M365FixtureSet {
    return {
      "calendar-today.json": { value: this.#events },
      "workiq-meetings.json": { results: this.#workiqResults },
    };
  }
}
