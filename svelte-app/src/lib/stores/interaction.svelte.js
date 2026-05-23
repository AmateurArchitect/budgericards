import { deckStore } from "./deck.svelte.js";

/**
 * @typedef {Object} CardInteractionState
 * @property {any | null} hoveredCard - The card object currently being hovered
 * @property {string | null} hoveredZone - The zone (board) of the hovered card
 * @property {number | null} hoveredPrice - The price of the hovered card
 * @property {any | null} menuCard - The card locked into the context menu
 * @property {string | null} menuZone - The zone of the menu card
 * @property {number | null} menuPrice - The price of the menu card
 * @property {boolean} isMenuOpen - Whether the context menu is currently visible
 * @property {{x: number, y: number} | null} menuPosition
 * @property {any[]} activeAnimations - Array of active card move animations
 * @property {string | null} editingCardId - The ID of the card currently being edited inline
 * @property {Object} quantityModal
 * @property {boolean} quantityModal.isOpen
 * @property {any | null} quantityModal.card
 * @property {string | null} quantityModal.zone
 * @property {number | null} quantityModal.price
 * @property {number} quantityModal.initialValue
 * @property {boolean} quantityModal.isAdding
 */

function createInteractionStore() {
	/** @type {CardInteractionState} */
	let state = $state({
		hoveredCard: null,
		hoveredZone: null,
		hoveredPrice: null,
		menuCard: null,
		menuZone: null,
		menuPrice: null,
		isMenuOpen: false,
		menuPosition: null,
		activeAnimations: [],
		editingCardId: null,
		quantityModal: {
			isOpen: false,
			card: null,
			zone: null,
			price: null,
			initialValue: 1,
			isAdding: false
		}
	});

	// Global key listener
	if (typeof window !== 'undefined') {
		window.addEventListener('keydown', (e) => {
			if (!state.hoveredCard || state.isMenuOpen) return;

			// Don't trigger shortcuts if typing in an input
			const target = /** @type {HTMLElement} */ (e.target);
			if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

			const name = /** @type {string} */ (state.hoveredCard.name);
			const zone = /** @type {string} */ (state.hoveredZone);
			const price = state.hoveredPrice;
			const card = state.hoveredCard;

			switch (e.key.toLowerCase()) {
				case 's':
					if (zone === 'sideboard') {
						deckStore.moveCard(name, 'sideboard', 'mainboard', card.id, price);
					} else {
						deckStore.moveCard(name, zone, 'sideboard', card.id, price);
					}
					break;
				case 'm':
					if (zone === 'maybeboard') {
						deckStore.moveCard(name, 'maybeboard', 'mainboard', card.id, price);
					} else {
						deckStore.moveCard(name, zone, 'maybeboard', card.id, price);
					}
					break;
				case 'o':
					window.open(`https://scryfall.com/search?q=!"${name}"`, '_blank');
					break;
				case 'p':
					import('./search.svelte.js').then(({ searchStore }) => {
						searchStore.collection = 'scryfall';
						searchStore.query = `!"${name}" unique:prints`;
					});
					break;
				case 'q':
					if (['mainboard', 'sideboard', 'maybeboard', 'commander', 'companion'].includes(zone)) {
						this.startEditing(card.id, zone, price);
					} else {
						this.showQuantityModal(card, zone, price);
					}
					break;
				case 'delete':
				case 'backspace':
					if (e.shiftKey) {
						deckStore.removeAllCopies(name, zone);
					} else {
						deckStore.removeCard(name, zone, card.id);
					}
					break;
				case '=':
				case '+':
					if (e.shiftKey) {
						deckStore.addCard(name, deckStore.activeBoard, price, card);
					}
					break;
			}
		});
	}

	return {
		get hoveredCard() { return state.hoveredCard; },
		get hoveredZone() { return state.hoveredZone; },
		get hoveredPrice() { return state.hoveredPrice; },
		get menuCard() { return state.menuCard; },
		get menuZone() { return state.menuZone; },
		get menuPrice() { return state.menuPrice; },
		get isMenuOpen() { return state.isMenuOpen; },
		set isMenuOpen(val) {
			state.isMenuOpen = val;
			if (!val) {
				state.menuCard = null;
				state.menuZone = null;
				state.menuPrice = null;
			}
		},
		get menuPosition() { return state.menuPosition; },
		get editingCardId() { return state.editingCardId; },
		get quantityModal() { return state.quantityModal; },

		/**
		 * @param {any} card
		 * @param {string} zone
		 * @param {number | null} price
		 * @param {boolean} isAdding
		 */
		showQuantityModal(card, zone, price, isAdding = false) {
			state.quantityModal = {
				isOpen: true,
				card,
				zone,
				price,
				initialValue: card.stackCount || 1,
				isAdding
			};
		},

		closeQuantityModal() {
			state.quantityModal.isOpen = false;
		},

		/**
		 * @param {string | null} id 
		 * @param {string} zone 
		 * @param {number | null} price 
		 */
		startEditing(id, zone, price) {
			state.editingCardId = id;
			state.hoveredCard = null; // Prevent tooltip while editing
			state.isMenuOpen = false;
		},

		stopEditing() {
			state.editingCardId = null;
		},

		/**
		 * @param {MouseEvent} e
		 * @param {any} card
		 * @param {string} zone
		 * @param {number | null} price
		 */
		showMenu(e, card, zone, price) {
			e.preventDefault();
			e.stopPropagation();
			state.hoveredCard = card;
			state.hoveredZone = zone;
			state.hoveredPrice = price;
			state.menuCard = card;
			state.menuZone = zone;
			state.menuPrice = price;
			state.menuPosition = { x: e.clientX, y: e.clientY };
			state.isMenuOpen = true;
		},

		get menuItems() {
			if (!state.menuCard) return [];
			const name = /** @type {string} */ (state.menuCard.name);
			const zone = /** @type {string} */ (state.menuZone);
			const price = state.menuPrice;
			const card = state.menuCard;

			const isFromSearch = zone === 'scryfall' || zone === 'budget-edh-26.2' || zone === 'budget-staples' || zone === 'garbage';

			const meta = card.type_line ? card : deckStore.metadata[name.toLowerCase()];
			const typeLine = meta?.type_line || "";
			const oracleText = meta?.oracle_text || "";
			const isLegendary = typeLine.includes("Legendary");
			const isCreature = typeLine.includes("Creature");
			const isPlaneswalker = typeLine.includes("Planeswalker");
			const isCompanion = meta?.oracle_text?.includes("Companion") || typeLine.includes("Companion");

			const hasPartner = /partner|friends forever|choose a background/i.test(oracleText);

			// Commander eligibility
			const canBeCommander = (isLegendary && isCreature) ||
				(isPlaneswalker && ['Brawl', 'Oathbreaker', 'Commander'].includes(deckStore.format));

			const items = [];

			if (isFromSearch) {
				items.push({
					label: "Add One to Deck",
					shortcuts: ["="],
					action: () => deckStore.addCard(name, deckStore.activeBoard, price, card)
				});
				items.push({
					label: "Add Multiple to Deck...",
					shortcuts: ["Q"],
					action: () => this.showQuantityModal(card, zone, price, true)
				});
			} else {
				items.push({
					label: "Add One",
					shortcuts: ["Shift + ="],
					action: () => deckStore.addCard(name, zone, price, card)
				});
				items.push({
					label: "Delete One",
					shortcuts: ["Delete"],
					action: () => deckStore.removeCard(name, zone, card.id)
				});
				items.push({
					label: "Delete All",
					shortcuts: ["Shift + Delete"],
					action: () => deckStore.removeAllCopies(name, zone)
				});
				items.push({
					label: "Set Quantity",
					shortcuts: ["Q"],
					action: () => {
						if (['mainboard', 'sideboard', 'maybeboard', 'commander', 'companion'].includes(zone)) {
							this.startEditing(card.id, zone, price);
						} else {
							this.showQuantityModal(card, zone, price, false);
						}
					}
				});
			}

			items.push({ divider: true });

			const existingCommander = deckStore.commander[0];
			const existingMeta = existingCommander ? deckStore.metadata[existingCommander.name.toLowerCase()] : null;

			/** 
			 * @param {string} name 
			 * @param {any} meta 
			 */
			const getPartnerLogic = (name, meta) => {
				const text = meta?.oracle_text || "";
				const type = meta?.type_line || "";
				
				if (text.toLowerCase().includes("partner with ")) {
					const match = text.match(/Partner with ([^(\n\.,]+)/i);
					return { type: 'specific', target: match ? match[1].trim() : null };
				}
				if (text.includes("Friends forever")) return { type: 'friends' };
				if (text.includes("Choose a Background")) return { type: 'commander-background' };
				if (type.includes("Background") && type.includes("Enchantment")) return { type: 'background' };
				if (text.includes("Doctor's companion")) return { type: 'doctors-companion' };
				if (type.includes("Doctor") && type.includes("Time Lord")) return { type: 'doctor' };
				if (text.includes("Partner")) return { type: 'global' };
				
				return null;
			};

			/**
			 * @param {any} logicA
			 * @param {string} nameA
			 * @param {any} logicB
			 * @param {string} nameB
			 */
			const canPair = (logicA, nameA, logicB, nameB) => {
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
			};

			const newLogic = getPartnerLogic(name, meta);
			const existingLogic = getPartnerLogic(existingCommander?.name || "", existingMeta);
			const isLegalPair = canPair(newLogic, name, existingLogic, existingCommander?.name || "");

			// Robust slot detection
			const isInCommander = zone === 'commander' || deckStore.commander.some(/** @param {any} c */ c => c.id === card.id);
			const isInCompanion = zone === 'companion' || deckStore.companion.some(/** @param {any} c */ c => c.id === card.id);

			// Commander Item
			if (canBeCommander || isInCommander) {
				items.push({
					label: isInCommander ? "Remove Commander" : "Set Commander",
					action: () => {
						if (isInCommander) {
							// Find the actual board instance to move
							const instance = deckStore.commander.find(c => c.id === card.id) || card;
							deckStore.moveCard(instance.name, 'commander', 'mainboard', instance.id, instance.price);
						} else {
							if (deckStore.format === 'List') deckStore.format = 'Commander';

							// Swap logic: only add without swapping if they are a legal pair and there's room
							const shouldSwap = !(isLegalPair && deckStore.commander.length === 1);

							if (shouldSwap && deckStore.commander.length > 0) {
								const targetZone = isFromSearch ? 'garbage' : zone;
								[...deckStore.commander].forEach(c => {
									if (isFromSearch) {
										deckStore.removeCard(c.name, 'commander', c.id);
									} else {
										deckStore.moveCard(c.name, 'commander', targetZone, c.id, c.price);
									}
								});
							}

							if (isFromSearch) {
								deckStore.addCard(name, 'commander', price, card);
							} else {
								deckStore.moveCard(name, zone, 'commander', card.id, price);
							}
						}
					}
				});
			}

			// Companion Item
			if (isCompanion || isInCompanion) {
				items.push({
					label: isInCompanion ? "Remove Companion" : "Set Companion",
					action: () => {
						if (isInCompanion) {
							const instance = deckStore.companion.find(/** @param {any} c */ c => c.id === card.id) || card;
							deckStore.moveCard(instance.name, 'companion', 'mainboard', instance.id, instance.price);
						} else {
							// Swap logic: move existing companions back to the source zone
							if (deckStore.companion.length > 0) {
								const targetZone = isFromSearch ? 'garbage' : zone;
								[...deckStore.companion].forEach(c => {
									if (isFromSearch) {
										deckStore.removeCard(c.name, 'companion', c.id);
									} else {
										deckStore.moveCard(c.name, 'companion', targetZone, c.id, c.price);
									}
								});
							}

							if (isFromSearch) {
								deckStore.addCard(name, 'companion', price, card);
							} else {
								deckStore.moveCard(name, zone, 'companion', card.id, price);
							}
						}
					}
				});
			}

			items.push({ divider: true });

			// Board Items
			if (zone !== 'sideboard') {
				items.push({
					label: "Sideboard",
					shortcuts: ["S"],
					action: () => {
						if (isFromSearch) {
							deckStore.addCard(name, 'sideboard', price, card);
						} else {
							deckStore.moveCard(name, zone, 'sideboard', card.id, price);
						}
					}
				});
			} else {
				items.push({
					label: "Move to Mainboard",
					shortcuts: ["S"],
					action: () => deckStore.moveCard(name, 'sideboard', 'mainboard', card.id, price)
				});
			}

			if (zone !== 'maybeboard') {
				items.push({
					label: "Maybeboard",
					shortcuts: ["M"],
					action: () => {
						if (isFromSearch) {
							deckStore.addCard(name, 'maybeboard', price, card);
						} else {
							deckStore.moveCard(name, zone, 'maybeboard', card.id, price);
						}
					}
				});
			} else {
				items.push({
					label: "Move to Mainboard",
					shortcuts: ["M"],
					action: () => deckStore.moveCard(name, 'maybeboard', 'mainboard', card.id, price)
				});
			}

			items.push({ divider: true });

			items.push({
				label: isFromSearch ? "See all prints" : "Change Printing",
				shortcuts: ["P"],
				action: () => {
					import('./search.svelte.js').then(({ searchStore }) => {
						searchStore.collection = 'scryfall';
						searchStore.query = `!"${name}" unique:prints`;
					});
				}
			});

			items.push({
				label: "Set Deck Image",
				action: () => {
					const isDfc = card.card_faces && card.card_faces.length > 1;
					const artUrl = isDfc ? card.card_faces[0].image_uris?.art_crop : card.image_uris?.art_crop;
					if (artUrl) deckStore.coverArt = artUrl;
				}
			});

			items.push({
				label: "Open in Scryfall",
				shortcuts: ["O"],
				action: () => window.open(meta?.scryfall_uri || `https://scryfall.com/search?q=!"${name}"`, '_blank')
			});

			// Clean up dividers: remove leading/trailing or consecutive dividers
			/** @type {any[]} */
			const filteredItems = items.reduce(/** @param {any[]} acc, @param {any} item */ (acc, item) => {
				if (item.divider) {
					if (acc.length === 0 || acc[acc.length - 1].divider) return acc;
				}
				acc.push(item);
				return acc;
			}, []);

			if (filteredItems.length > 0 && filteredItems[filteredItems.length - 1].divider) {
				filteredItems.pop();
			}

			return filteredItems;
		},

		/**
		 * @param {any} card
		 * @param {string} zone
		 * @param {number | null} price
		 */
		registerHover(card, zone, price) {
			if (state.hoveredCard?.id === card.id && state.hoveredZone === zone) return;
			state.hoveredCard = card;
			state.hoveredZone = zone;
			state.hoveredPrice = price;
		},

		unregisterHover() {
			if (!state.isMenuOpen) {
				state.hoveredCard = null;
				state.hoveredZone = null;
				state.hoveredPrice = null;
			}
		},

		get activeAnimations() { return state.activeAnimations; },

		/**
		 * @param {any} card 
		 * @param {DOMRect} sourceRect 
		 * @param {string} board
		 */
		triggerMoveAnimation(card, sourceRect, board) {
			const id = Math.random().toString(36).substring(7);
			const animation = {
				id,
				card,
				sourceRect,
				board,
				startTime: Date.now()
			};
			state.activeAnimations.push(animation);

			// Auto-cleanup after animation duration (e.g., 600ms)
			setTimeout(() => {
				state.activeAnimations = state.activeAnimations.filter(a => a.id !== id);
			}, 800);
		}
	};
}

export const interactionStore = createInteractionStore();
