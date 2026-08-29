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

/**
 * @param {string} name 
 * @param {any} meta 
 */
export function getPartnerLogic(name, meta) {
	if (!meta) return null;
	const text = meta?.oracle_text || "";
	const type = meta?.type_line || "";
	const facesOracle = (meta?.card_faces || []).map((/** @type {any} */ f) => (f.oracle_text || "")).join(" ");
	const fullText = `${text} ${facesOracle}`;
	const lowerText = fullText.toLowerCase();
	
	if (lowerText.includes("partner with ")) {
		const match = fullText.match(/Partner with ([^\n\.,(\r]+)/i);
		return { type: 'specific', target: match ? match[1].trim() : null };
	}
	if (lowerText.includes("friends forever")) return { type: 'friends' };
	if (lowerText.includes("choose a background")) return { type: 'commander-background' };
	if (type.includes("Background") && type.includes("Enchantment")) return { type: 'background' };
	if (lowerText.includes("doctor's companion")) return { type: 'doctors-companion' };
	if (type.includes("Doctor") && type.includes("Time Lord")) return { type: 'doctor' };
	if (lowerText.includes("partner")) return { type: 'global' };
	
	return null;
}

/**
 * @param {any} logicA
 * @param {string} nameA
 * @param {any} logicB
 * @param {string} nameB
 */
export function canPair(logicA, nameA, logicB, nameB) {
	if (!logicA || !logicB) return false;
	
	// 1. Global Partners
	if (logicA.type === 'global' && logicB.type === 'global') return true;
	
	// 2. Friends Forever
	if (logicA.type === 'friends' && logicB.type === 'friends') return true;
	
	// 3. Specific Partners ("Partner with [Name]")
	if (logicA.type === 'specific' && nameB.toLowerCase().includes(logicA.target?.toLowerCase() || "")) return true;
	if (logicB.type === 'specific' && nameA.toLowerCase().includes(logicB.target?.toLowerCase() || "")) return true;
	
	// 4. Backgrounds
	if (logicA.type === 'commander-background' && logicB.type === 'background') return true;
	if (logicB.type === 'commander-background' && logicA.type === 'background') return true;
	
	// 5. Doctor's Companion
	if (logicA.type === 'doctors-companion' && logicB.type === 'doctor') return true;
	if (logicB.type === 'doctors-companion' && logicA.type === 'doctor') return true;
	
	return false;
}

/**
 * Checks if a card is eligible to be a commander in the given format / deck context.
 * @param {any} card
 * @param {string} [format]
 * @param {any[]} [currentCommanders]
 * @returns {boolean}
 */
export function canCardBeCommander(card, format = deckStore.format || 'Commander', currentCommanders = deckStore.commander) {
	if (!card) return false;
	const meta = card.type_line ? card : (deckStore.metadata[card.name?.toLowerCase()] || card);
	const typeLine = (meta?.type_line || "").toLowerCase();
	const oracle = (meta?.oracle_text || "").toLowerCase();
	const facesOracle = (meta?.card_faces || []).map((/** @type {any} */ f) => (f.oracle_text || "").toLowerCase()).join(" ");
	const fullOracle = `${oracle} ${facesOracle}`;

	const isLegendary = typeLine.includes("legendary");
	const isCreature = typeLine.includes("creature");
	const isPlaneswalker = typeLine.includes("planeswalker");
	const hasCommanderText = fullOracle.includes("can be your commander");

	if (isLegendary && isCreature) return true;
	if (hasCommanderText) return true;
	if (["Brawl", "Oathbreaker"].includes(format) && isPlaneswalker) return true;
	if (format === "Commander" && isPlaneswalker && hasCommanderText) return true;

	// Backgrounds can be commander if pairing with a Choose a Background commander
	if (typeLine.includes("background") && typeLine.includes("enchantment")) {
		if (currentCommanders && currentCommanders.length > 0) {
			const firstCmd = currentCommanders[0];
			const firstMeta = deckStore.metadata[firstCmd.name.toLowerCase()] || firstCmd;
			const firstLogic = getPartnerLogic(firstCmd.name, firstMeta);
			if (firstLogic?.type === 'commander-background') return true;
		}
	}

	return false;
}
