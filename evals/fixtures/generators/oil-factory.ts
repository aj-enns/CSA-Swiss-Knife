/**
 * Synthetic OIL (Vault) Fixture Factory
 *
 * Generates realistic Obsidian vault fixture data for eval scenarios.
 * Mirrors the response shapes from the real OIL MCP server.
 */

export interface VaultContext {
  vaultPath: string;
  noteCount: number;
  customers: string[];
  recentNotes: Array<{ path: string; modified: string }>;
}

export interface CustomerContext {
  customer: string;
  notes: Array<{ path: string; title: string }>;
  opportunities: string[];
  lastContact: string;
}

export interface VaultSearchResult {
  results: Array<{ path: string; score: number; snippet: string }>;
}

export interface VaultNote {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface OilFixtureSet {
  "vault-context.json": VaultContext;
  customers: Map<string, CustomerContext>;
}

function recentDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export class OilFixtureFactory {
  #customers: Map<string, CustomerContext> = new Map();
  #vaultPath = "/mock/vault";

  /** Add a customer to the vault with notes */
  addCustomer(
    name: string,
    overrides: Partial<CustomerContext> = {},
  ): this {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    this.#customers.set(name, {
      customer: name,
      notes: [
        { path: `Customers/${name}/overview.md`, title: `${name} Overview` },
        { path: `Customers/${name}/architecture-decisions.md`, title: "Architecture Decisions" },
      ],
      opportunities: [],
      lastContact: recentDate(1),
      ...overrides,
    });
    return this;
  }

  /** Link opportunity numbers to a customer */
  linkOpportunities(customer: string, oppNumbers: string[]): this {
    const ctx = this.#customers.get(customer);
    if (ctx) ctx.opportunities = oppNumbers;
    return this;
  }

  // ── Presets ─────────────────────────────────────────────────────────────

  /** Standard vault with Contoso + Fabrikam */
  static standard(): OilFixtureFactory {
    return new OilFixtureFactory()
      .addCustomer("Contoso", {
        lastContact: recentDate(1),
        opportunities: ["OPP-2026-001", "OPP-2026-002"],
      })
      .addCustomer("Fabrikam", {
        lastContact: recentDate(7),
        opportunities: ["OPP-2026-003"],
      })
      .addCustomer("Northwind Traders", {
        lastContact: recentDate(30),
      });
  }

  /** Empty vault — no customers */
  static empty(): OilFixtureFactory {
    return new OilFixtureFactory();
  }

  // ── Build ─────────────────────────────────────────────────────────────

  /** Build the vault-context response */
  buildVaultContext(): VaultContext {
    const customers = [...this.#customers.keys()];
    const recentNotes = customers.flatMap((c) => [
      { path: `Customers/${c}/overview.md`, modified: recentDate(1) },
    ]);
    return {
      vaultPath: this.#vaultPath,
      noteCount: this.#customers.size * 5,
      customers,
      recentNotes: recentNotes.slice(0, 5),
    };
  }

  /** Build customer context for a specific customer */
  buildCustomerContext(customer: string): CustomerContext {
    return (
      this.#customers.get(customer) ?? {
        customer,
        notes: [],
        opportunities: [],
        lastContact: recentDate(0),
      }
    );
  }

  /** Build the full fixture set */
  build(): OilFixtureSet {
    return {
      "vault-context.json": this.buildVaultContext(),
      customers: new Map(this.#customers),
    };
  }
}
