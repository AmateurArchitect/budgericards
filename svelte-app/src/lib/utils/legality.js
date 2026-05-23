import { deckStore } from '$lib/stores/deck.svelte.js';

/**
 * @typedef {Object} LegalityResult
 * @property {boolean} isLegal
 * @property {string[]} reasons
 */

/**
 * Checks the legality of a card within the current deck context.
 * @param {any} card The card metadata
 * @param {string} format The format to check against (default: 'commander')
 * @returns {LegalityResult}
 */
export function checkLegality(card, format = 'commander') {
    if (!card || card.notFound) {
        return { isLegal: true, reasons: [] };
    }

    const reasons = [];
    
    // List format has no legality rules
    if (!deckStore.format || deckStore.format === 'List') {
        return { isLegal: true, reasons: [] };
    }

    const activeFormat = deckStore.format.toLowerCase();

    // 1. Format Legality (Scryfall data)
    if (card.legalities) {
        const status = card.legalities[activeFormat];
        const formatName = activeFormat.charAt(0).toUpperCase() + activeFormat.slice(1);
        if (status === 'banned') {
            reasons.push(`Banned in ${formatName}`);
        } else if (status === 'not_legal') {
            reasons.push(`Not Legal in ${formatName}`);
        }
    }

    // 2. Commander Identity
    const commanders = deckStore.commander;
    if (commanders.length > 0 && !card.type_line?.includes('Commander')) {
        const identity = new Set();
        commanders.forEach(c => {
            const m = deckStore.metadata[c.name.toLowerCase()];
            if (m?.color_identity) m.color_identity.forEach(/** @param {string} col */ col => identity.add(col));
        });

        if (identity.size > 0) {
            const cardId = card.color_identity || [];
            const illegalColors = cardId.filter(/** @param {string} col */ col => !identity.has(col));
            if (illegalColors.length > 0) {
                reasons.push(`Outside Commander Identity`);
            }
        }
    }

    // 3. Companion Restriction
    const companion = deckStore.companion[0];
    if (companion && card.id !== companion.id) {
        const name = companion.name.toLowerCase();
        const cmc = card.cmc || 0;
        const isLand = card.type_line?.includes("Land");
        
        let companionMatch = true;
        let restrictionLabel = "";

        if (name.includes("gyruda")) {
            companionMatch = cmc % 2 === 0;
            restrictionLabel = "Requires even mana value";
        } else if (name.includes("obosh")) {
            companionMatch = cmc % 2 !== 0;
            restrictionLabel = "Requires odd mana value";
        } else if (name.includes("lurrus")) {
            companionMatch = isLand || cmc <= 2;
            restrictionLabel = "Requires permanents with MV <= 2";
        } else if (name.includes("keruga")) {
            companionMatch = isLand || cmc >= 3;
            restrictionLabel = "Requires permanents with MV >= 3";
        } else if (name.includes("jegantha")) {
            const cost = card.mana_cost || "";
            const symbols = cost.match(/\{([^}]+)\}/g) || [];
            /** @type {Record<string, number>} */
            const counts = {};
            for (const s of symbols) {
                counts[s] = (counts[s] || 0) + 1;
                if (counts[s] > 1 && !s.includes("/")) {
                    companionMatch = false;
                    break;
                }
            }
            restrictionLabel = "Requires no repeated mana symbols";
        } else if (name.includes("kaheera")) {
            const types = ["Cat", "Elemental", "Nightmare", "Dinosaur", "Beast"];
            companionMatch = isLand || types.some(t => card.type_line?.includes(t));
            restrictionLabel = "Requires specific creature types";
        } else if (name.includes("zirda")) {
            companionMatch = isLand || card.oracle_text?.includes(":") || card.card_faces?.[0]?.oracle_text?.includes(":");
            restrictionLabel = "Requires activated abilities";
        }

        if (!companionMatch) {
            reasons.push(`Illegal for Companion: ${restrictionLabel}`);
        }
    }

    return {
        isLegal: reasons.length === 0,
        reasons
    };
}
