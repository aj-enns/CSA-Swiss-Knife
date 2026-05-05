// MCAPS IQ — Mermaid brand theme with dark mode support
// Material for MkDocs renders mermaid via superfences; this
// overrides the default init if called after the library loads.

(function () {
  function getMermaidTheme() {
    var isDark = document.body.getAttribute("data-md-color-scheme") === "slate";
    return {
      startOnLoad: false,          // Material handles rendering
      theme: "base",
      themeVariables: {
        // Fonts
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: "14px",

        // Background
        background: isDark ? "#1a1a1a" : "#fafafa",
        mainBkg: isDark ? "#1e1e1e" : "#ffffff",

        // Primary colors (nodes with no inline style)
        primaryColor: isDark ? "#1565C0" : "#D0E8FF",
        primaryTextColor: isDark ? "#ffffff" : "#1B1B1B",
        primaryBorderColor: isDark ? "#1976D2" : "#0078D4",

        // Secondary
        secondaryColor: isDark ? "#004D40" : "#D4F5F7",
        secondaryTextColor: isDark ? "#ffffff" : "#1B1B1B",
        secondaryBorderColor: isDark ? "#00897B" : "#00B7C3",

        // Tertiary
        tertiaryColor: isDark ? "#1B5E20" : "#DFF6DD",
        tertiaryTextColor: isDark ? "#ffffff" : "#1B1B1B",
        tertiaryBorderColor: isDark ? "#2E7D32" : "#107C10",

        // Lines & arrows
        lineColor: isDark ? "rgba(255,255,255,0.25)" : "#b0b0b0",
        arrowheadColor: isDark ? "rgba(255,255,255,0.3)" : "#9e9e9e",

        // Node default stroke
        nodeBorder: isDark ? "#444" : "#ccc",
        nodeTextColor: isDark ? "#e0e0e0" : "#1B1B1B",

        // Cluster / subgraph
        clusterBkg: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,120,212,0.04)",
        clusterBorder: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,120,212,0.2)",

        // Edge labels
        edgeLabelBackground: isDark ? "#1a1a1a" : "#ffffff",

        // Sequence diagram
        actorBkg: isDark ? "#1565C0" : "#0078D4",
        actorTextColor: "#ffffff",
        actorBorder: isDark ? "#1976D2" : "#005a9e",
        actorLineColor: isDark ? "rgba(255,255,255,0.12)" : "#ddd",
        signalColor: isDark ? "rgba(255,255,255,0.7)" : "#333",
        signalTextColor: isDark ? "#e0e0e0" : "#1B1B1B",
        noteBkgColor: isDark ? "#332B00" : "#FFF4CE",
        noteBorderColor: isDark ? "#665500" : "#FFB900",
        noteTextColor: isDark ? "#FFD54F" : "#1B1B1B",
        activationBkgColor: isDark ? "rgba(0,120,212,0.2)" : "rgba(0,120,212,0.1)",
        activationBorderColor: isDark ? "#1976D2" : "#0078D4",
        sequenceNumberColor: "#ffffff",

        // Pie chart
        pie1: "#0078D4",
        pie2: "#00B7C3",
        pie3: "#107C10",
        pie4: "#5C2D91",
        pie5: "#FFB900",
        pie6: "#D13438",
        pie7: "#737373",
        pieOuterStrokeColor: isDark ? "#333" : "#e0e0e0",
        pieTitleTextColor: isDark ? "#e0e0e0" : "#1B1B1B",
        pieTitleTextSize: "16px",
        pieSectionTextColor: "#ffffff",
        pieSectionTextSize: "12px",
        pieStrokeWidth: "1px",

        // Flowchart
        nodeRadius: 12
      },
      flowchart: {
        curve: "basis",
        padding: 16,
        htmlLabels: true,
        useMaxWidth: true
      },
      sequence: {
        actorMargin: 80,
        boxMargin: 8,
        boxTextMargin: 6,
        noteMargin: 12,
        messageMargin: 40,
        mirrorActors: true,
        useMaxWidth: true
      }
    };
  }

  // Re-init when theme toggles
  var observer = new MutationObserver(function () {
    if (typeof mermaid !== "undefined" && mermaid.initialize) {
      mermaid.initialize(getMermaidTheme());
    }
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"]
  });
})();
