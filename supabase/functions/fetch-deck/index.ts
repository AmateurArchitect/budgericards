// Follow this setup guide to integrate the Supabase Edge Function:
// https://supabase.com/docs/guides/functions
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { platform, id, url } = await req.json();

    if (!platform || !id) {
      return new Response(
        JSON.stringify({ error: "Missing platform or deck ID." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- ARCHIDEKT ---
    if (platform === "archidekt") {
      const apiUrl = `https://archidekt.com/api/decks/${encodeURIComponent(id)}/`;
      const res = await fetch(apiUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "BudgeriCards/1.0"
        }
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Archidekt returned status ${res.status}. Deck may be private or not exist.` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const deck = await res.json();
      const title = deck.name || `Archidekt Deck ${id}`;
      const cards = Array.isArray(deck.cards) ? deck.cards : [];

      const mainLines: string[] = [];
      const sideLines: string[] = [];
      const maybeLines: string[] = [];

      for (const item of cards) {
        const oracle = item.card?.oracleCard;
        const name = oracle?.name || item.card?.displayName || "Unknown Card";
        const setCode = item.card?.edition?.editioncode ? item.card.edition.editioncode.toUpperCase() : "";
        const num = item.card?.collectorNumber || "";
        const qty = item.quantity || 1;
        
        // Tags / Categories
        const tags: string[] = [];
        if (Array.isArray(item.categories)) {
          for (const cat of item.categories) {
            if (cat && typeof cat === "string") {
              tags.push(cat.replace(/\s+/g, "_"));
            }
          }
        }

        const setPart = setCode ? ` (${setCode})` : "";
        const numPart = num ? ` ${num}` : "";
        const tagPart = tags.length ? ` ` + tags.map(t => `#${t}`).join(" ") : "";
        const line = `${qty} ${name}${setPart}${numPart}${tagPart}`;

        const modifier = (item.modifier || "").toLowerCase();
        if (modifier === "sideboard") {
          sideLines.push(line);
        } else if (modifier === "maybeboard") {
          maybeLines.push(line);
        } else {
          mainLines.push(line);
        }
      }

      let decklistText = mainLines.join("\n");
      if (sideLines.length > 0) {
        decklistText += "\n\n// Sideboard\n" + sideLines.join("\n");
      }
      if (maybeLines.length > 0) {
        decklistText += "\n\n// Maybeboard\n" + maybeLines.join("\n");
      }

      return new Response(
        JSON.stringify({
          success: true,
          platform: "archidekt",
          title,
          cardCount: cards.length,
          decklistText
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- MOXFIELD ---
    if (platform === "moxfield") {
      const apiUrl = `https://api.moxfield.com/v2/decks/all/${encodeURIComponent(id)}`;
      const res = await fetch(apiUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!res.ok) {
        // Moxfield often triggers Cloudflare 403 Bot protection
        if (res.status === 403) {
          return new Response(
            JSON.stringify({
              error: "Moxfield's Cloudflare bot challenge blocked automated retrieval. Please open the deck on Moxfield, click 'Export' > 'Copy to clipboard', and paste it directly into BudgeriCards."
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: `Moxfield returned status ${res.status}. Deck may be private or not exist.` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const deck = await res.json();
      const title = deck.name || `Moxfield Deck ${id}`;

      const formatBoard = (boardObj: Record<string, any> | undefined): string[] => {
        if (!boardObj || typeof boardObj !== "object") return [];
        return Object.values(boardObj).map(item => {
          const qty = item.quantity || 1;
          const name = item.card?.name || item.name || "Unknown Card";
          const setCode = item.card?.set ? item.card.set.toUpperCase() : "";
          const num = item.card?.cn || item.card?.collector_number || "";
          const setPart = setCode ? ` (${setCode})` : "";
          const numPart = num ? ` ${num}` : "";
          return `${qty} ${name}${setPart}${numPart}`;
        });
      };

      const commanders = formatBoard(deck.commanders);
      const companions = formatBoard(deck.companions);
      const main = formatBoard(deck.mainboard);
      const side = formatBoard(deck.sideboard);
      const maybe = formatBoard(deck.maybeboard);

      const allMain = [...commanders, ...companions, ...main];
      let decklistText = allMain.join("\n");
      if (side.length > 0) {
        decklistText += "\n\n// Sideboard\n" + side.join("\n");
      }
      if (maybe.length > 0) {
        decklistText += "\n\n// Maybeboard\n" + maybe.join("\n");
      }

      const totalCount = allMain.length + side.length + maybe.length;

      return new Response(
        JSON.stringify({
          success: true,
          platform: "moxfield",
          title,
          cardCount: totalCount,
          decklistText
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported platform '${platform}'.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
