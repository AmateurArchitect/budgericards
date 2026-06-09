<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import { X, Plus, Star, Search, AlertCircle, Check } from "lucide-svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { untrack } from "svelte";

	// --- Legal Magic: The Gathering Vocabulary Lists ---
	const LEGAL_SUPERTYPES = ["Basic", "Legendary", "Snow", "World", "Ongoing"];
	
	const LEGAL_CARD_TYPES = [
		"Creature", "Land", "Artifact", "Enchantment", "Instant", 
		"Sorcery", "Planeswalker", "Battle", "Kindred", "Tribal"
	];

	// Common / legal subtypes across all card types
	const LEGAL_SUBTYPES = [
		// Basic Land Types
		"Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
		// Nonbasic Land Types
		"Desert", "Gate", "Lair", "Cave", "Urza's", "Mine", "Power-Plant", "Tower",
		// Artifact Types
		"Equipment", "Food", "Clue", "Treasure", "Vehicle", "Contraption", "Blood", "Map", "Powerstone",
		// Enchantment Types
		"Aura", "Saga", "Class", "Role", "Background", "Cartouche", "Rune",
		// Spell Types
		"Adventure", "Arcane", "Trap",
		// Common Creature Types
		"Adviser", "Aetherborn", "Alien", "Ally", "Angel", "Antelope", "Ape", "Archer", "Archon", "Army", "Artificer", "Assassin", "Assembly-Worker", "Atog", "Aurochs", "Avatar", "Azra", 
		"Badger", "Balloon", "Bard", "Basilisk", "Bat", "Bear", "Beast", "Beeble", "Beholder", "Bird", "Boar", "Bringer", "Brushwagg", 
		"Camarid", "Camel", "Caribou", "Carrier", "Cat", "Centaur", "Cephalid", "Chimera", "Citizen", "Cleric", "Cockatrice", "Construct", "Coward", "Crab", "Crocodile", "Cyclops", 
		"Dauthi", "Demigod", "Demon", "Deserter", "Devil", "Dinosaur", "Djinn", "Dog", "Dragon", "Drake", "Dreadnought", "Drone", "Drudge", "Dryad", "Dwarf", 
		"Efreet", "Egg", "Elder", "Eldrazi", "Elemental", "Elephant", "Elf", "Elk", "Eye", 
		"Faerie", "Ferret", "Fish", "Flagbearer", "Fox", "Fractal", "Frog", "Fungus", 
		"Gargoyle", "Germ", "Giant", "Gith", "Gnoll", "Gnome", "Goat", "Goblin", "God", "Golem", "Gorgon", "Graveborn", "Gremlin", "Griffin", "Guest", 
		"Hag", "Halfling", "Hamster", "Harpy", "Hellion", "Hippo", "Hippogriff", "Homarid", "Homunculus", "Horror", "Horse", "Human", "Hydra", "Hyena", 
		"Illusion", "Imp", "Incarnation", "Inkling", "Insect", 
		"Jackal", "Jellyfish", "Juggernaut", 
		"Kavu", "Kirin", "Kithkin", "Knight", "Kobold", "Kor", "Kraken", 
		"Lamia", "Lammasu", "Leech", "Leviathan", "Lhurgoyf", "Licid", "Lizard", "Llama", 
		"Manticore", "Masticore", "Mercenary", "Merfolk", "Metathran", "Minotaur", "Minion", "Mite", "Mole", "Monger", "Mongoose", "Monk", "Monkey", "Moonfolk", "Mouse", "Mutant", "Myr", "Mystic", 
		"Naga", "Nautilus", "Nephilim", "Nightmare", "Nightstalker", "Ninja", "Noble", "Nogle", "Nomad", "Nymph", 
		"Octopus", "Ogre", "Ooze", "Orb", "Orc", "Orgg", "Otter", "Ouphe", "Ox", "Oyster", 
		"Pangolin", "Peasant", "Pegasus", "Pentavite", "Pest", "Phelddagrif", "Phoenix", "Phyrexian", "Pilot", "Pincher", "Pirate", "Plant", "Planeswalker", "Praetor", "Primordial", "Processor", 
		"Rabbit", "Raccoon", "Ranger", "Rat", "Rebel", "Reflection", "Rhino", "Rigger", "Rogue", 
		"Sable", "Salamander", "Samurai", "Sand", "Saproling", "Satyr", "Scarecrow", "Scion", "Scorpion", "Scout", "Sculpture", "Serf", "Serpent", "Servo", "Shade", "Shaman", "Shapeshifter", "Shark", "Sheep", "Siren", "Skeleton", "Slith", "Sliver", "Slug", "Snail", "Snake", "Soldier", "Soltari", "Spawn", "Specter", "Spellshaper", "Sphinx", "Spider", "Spike", "Spirit", "Splinter", "Sponge", "Squid", "Squirrel", "Starfish", "Surrakar", "Survivor", 
		"Tentacle", "Thalakos", "Thopter", "Thrull", "Tiefling", "Treefolk", "Trilobite", "Triskelavite", "Troll", "Turtle", 
		"Unicorn", 
		"Vampire", "Vithian", "Vedalken", "Velocidome", "Viashino", "Volver", 
		"Wall", "Warlock", "Warrior", "Weird", "Werewolf", "Whale", "Wizard", "Wolf", "Wolverine", "Wombat", "Wurm", 
		"Yeti", 
		"Zombie", "Zubera"
	];

	// --- Component States ---
	let cmc = $state(0);
	let colorCategory = $state("Default");

	// Separated Type States
	/** @type {string[]} */
	let supertypes = $state([]);
	/** @type {string[]} */
	let cardTypes = $state([]);
	/** @type {string[]} */
	let subtypes = $state([]);

	// Local tags state
	/** @type {string[]} */
	let tags = $state([]);
	/** @type {string | null} */
	let primaryTag = $state(null);
	let newTagInput = $state("");

	// Autocomplete/Command Palette states
	let showColorDropdown = $state(false);
	
	let supertypeSearchQuery = $state("");
	let showSupertypeDropdown = $state(false);
	
	let cardTypeSearchQuery = $state("");
	let showCardTypeDropdown = $state(false);

	let subtypeSearchQuery = $state("");
	let showSubtypeDropdown = $state(false);
	let subtypeValidationError = $state("");

	// Track initial values for styling
	let initialCmc = $state(0);
	let initialColorCategory = $state("Default");
	/** @type {string[]} */
	let initialSupertypes = $state([]);
	/** @type {string[]} */
	let initialCardTypes = $state([]);
	/** @type {string[]} */
	let initialSubtypes = $state([]);
	/** @type {string[]} */
	let initialTags = $state([]);
	/** @type {string | null} */
	let initialPrimaryTag = $state(null);

	let card = $derived(interactionStore.cardDataModal.card);

	// Derived defaults from database metadata
	let defaultCmc = $derived(card ? (deckStore.metadata[card.name.toLowerCase()]?.cmc ?? card.cmc ?? 0) : 0);
	
	// Parse native typeline into structures
	/** 
	 * @param {string} tlString
	 */
	function parseTypeLine(tlString) {
		const parts = tlString.split(/[—\-]/);
		const left = parts[0] || "";
		const right = parts[1] || "";
		
		const leftWords = left.trim().split(/\s+/).filter(Boolean);
		const parsedSupertypes = leftWords.filter(w => LEGAL_SUPERTYPES.includes(w));
		const parsedCardTypes = leftWords.filter(w => LEGAL_CARD_TYPES.includes(w));
		
		// Subtypes can be any of the remainder words
		const parsedSubtypes = right.trim().split(/\s+/).filter(Boolean);
		
		return {
			supertypes: parsedSupertypes,
			cardTypes: parsedCardTypes,
			subtypes: parsedSubtypes
		};
	}

	// derived defaults for type line
	let defaultTypeLineParts = $derived.by(() => {
		if (!card) return { supertypes: [], cardTypes: [], subtypes: [] };
		const metadata = deckStore.metadata[card.name.toLowerCase()] || {};
		const baseStr = card.type_line || metadata.type_line || "";
		return parseTypeLine(baseStr);
	});

	// Derived global list of tags in the deck
	let deckTagsList = $derived.by(() => {
		const allTags = new Set();
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		const storeAny = /** @type {any} */ (deckStore);
		for (const board of boards) {
			if (storeAny[board]) {
				const list = storeAny[board] || [];
				for (const c of list) {
					if (c.tags) {
						for (const t of c.tags) {
							allTags.add(t);
						}
					}
				}
			}
		}
		return [...allTags].sort((a, b) => a.localeCompare(b));
	});

	// Handle Modal opening / initial values injection using untrack to prevent reactive trigger loops
	let lastOpenState = false;
	$effect(() => {
		const isOpen = interactionStore.cardDataModal.isOpen;
		if (isOpen && !lastOpenState) {
			untrack(() => {
				if (card) {
					const overrides = card.overrides || {};
					const metadata = deckStore.metadata[card.name.toLowerCase()] || {};

					cmc = overrides.manaValue !== undefined 
						? overrides.manaValue 
						: (card.cmc !== undefined ? card.cmc : (metadata.cmc ?? 0));

					colorCategory = overrides.colorCategory !== undefined 
						? overrides.colorCategory 
						: "Default";

					const typeLineStr = overrides.primaryType !== undefined 
						? overrides.primaryType 
						: (card.type_line || metadata.type_line || "");

					const parsed = parseTypeLine(typeLineStr);
					supertypes = parsed.supertypes;
					cardTypes = parsed.cardTypes;
					subtypes = parsed.subtypes;

					tags = card.tags ? [...card.tags] : [];
					primaryTag = card.primaryTag || (tags[0] || null);

					// Initialize initial state references
					initialCmc = cmc;
					initialColorCategory = colorCategory;
					initialSupertypes = [...supertypes];
					initialCardTypes = [...cardTypes];
					initialSubtypes = [...subtypes];
					initialTags = [...tags];
					initialPrimaryTag = primaryTag;

					// Reset palette states
					newTagInput = "";
					supertypeSearchQuery = "";
					cardTypeSearchQuery = "";
					subtypeSearchQuery = "";
					subtypeValidationError = "";
					showColorDropdown = false;
					showSupertypeDropdown = false;
					showCardTypeDropdown = false;
					showSubtypeDropdown = false;
				}
			});
		}
		lastOpenState = isOpen;
	});

	function handleClose() {
		interactionStore.closeCardDataModal();
	}

	function handleSubmit() {
		if (!card) return;
		const cardId = card.id;

		// 1. CMC Override
		const parsedCmc = parseInt(String(cmc), 10);
		if (!isNaN(parsedCmc)) {
			deckStore.setCardOverride(cardId, 'manaValue', parsedCmc);
		}

		// 2. Type Override (Rebuilt from supertypes, cardTypes, subtypes)
		let left = [...supertypes, ...cardTypes].join(" ");
		let fullType = left;
		if (subtypes.length > 0) {
			fullType = `${left} — ${subtypes.join(" ")}`;
		}
		deckStore.setCardOverride(cardId, 'primaryType', fullType.trim());

		// 3. Color Category Override
		if (colorCategory === "Default") {
			deckStore.resetCardOverride(cardId, 'colorCategory');
			deckStore.resetCardOverride(cardId, 'colors');
			deckStore.resetCardOverride(cardId, 'colorIdentity');
		} else {
			deckStore.setCardOverride(cardId, 'colorCategory', colorCategory);
			/** @type {Record<string, string[]>} */
			const mapColors = { "White": ["W"], "Blue": ["U"], "Black": ["B"], "Red": ["R"], "Green": ["G"] };
			if (mapColors[colorCategory]) {
				deckStore.setCardOverride(cardId, 'colors', mapColors[colorCategory]);
				deckStore.setCardOverride(cardId, 'colorIdentity', mapColors[colorCategory]);
			} else if (colorCategory === "Colorless") {
				deckStore.setCardOverride(cardId, 'colors', []);
				deckStore.setCardOverride(cardId, 'colorIdentity', []);
			}
		}

		// 4. Tags Override
		deckStore.reorderCardTags(cardId, tags);
		if (primaryTag) {
			deckStore.setPrimaryTag(cardId, primaryTag);
		} else {
			const result = deckStore.findCardById(cardId);
			if (result && result.card) {
				delete result.card.primaryTag;
			}
		}

		handleClose();
	}

	// --- Helper actions for adding/removing array values ---
	
	/** @param {string} item */
	function toggleSupertype(item) {
		if (supertypes.includes(item)) {
			supertypes = supertypes.filter(x => x !== item);
		} else {
			supertypes = [...supertypes, item];
		}
	}

	/** @param {string} item */
	function toggleCardType(item) {
		if (cardTypes.includes(item)) {
			cardTypes = cardTypes.filter(x => x !== item);
		} else {
			cardTypes = [...cardTypes, item];
		}
	}

	function addSubtypeFromSearch() {
		const val = subtypeSearchQuery.trim();
		// Normalize casing to MTG standard title case (e.g. elf -> Elf)
		const normalized = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
		
		if (!normalized) return;

		// Validation check
		if (!LEGAL_SUBTYPES.includes(normalized)) {
			subtypeValidationError = `"${normalized}" is not a legal Magic subtype.`;
			return;
		}

		if (!subtypes.includes(normalized)) {
			subtypes = [...subtypes, normalized];
		}
		subtypeSearchQuery = "";
		subtypeValidationError = "";
		showSubtypeDropdown = false;
	}

	/** @param {string} item */
	function removeSubtype(item) {
		subtypes = subtypes.filter(x => x !== item);
	}

	function addTag() {
		const val = newTagInput.trim();
		if (val && !tags.includes(val)) {
			tags.push(val);
			if (!primaryTag) {
				primaryTag = val;
			}
			newTagInput = "";
		}
	}

	/** @param {string} tag */
	function removeTag(tag) {
		tags = tags.filter(t => t !== tag);
		if (primaryTag === tag) {
			primaryTag = tags[0] || null;
		}
	}

	/** @param {string} tag */
	function togglePrimary(tag) {
		primaryTag = primaryTag === tag ? (tags.find(t => t !== tag) || null) : tag;
	}

	// --- State checks for changed / overridden values ---
	let isCmcChanged = $derived(cmc !== initialCmc);
	let isCmcCustom = $derived(cmc !== defaultCmc);

	let isColorChanged = $derived(colorCategory !== initialColorCategory);
	let isColorCustom = $derived(colorCategory !== "Default");

	// Types equality checks
	let isSupertypesChanged = $derived(
		supertypes.length !== initialSupertypes.length || supertypes.some((s, i) => s !== initialSupertypes[i])
	);
	let isSupertypesCustom = $derived(
		supertypes.length !== defaultTypeLineParts.supertypes.length || supertypes.some((s, i) => s !== defaultTypeLineParts.supertypes[i])
	);

	let isCardTypesChanged = $derived(
		cardTypes.length !== initialCardTypes.length || cardTypes.some((t, i) => t !== initialCardTypes[i])
	);
	let isCardTypesCustom = $derived(
		cardTypes.length !== defaultTypeLineParts.cardTypes.length || cardTypes.some((t, i) => t !== defaultTypeLineParts.cardTypes[i])
	);

	let isSubtypesChanged = $derived(
		subtypes.length !== initialSubtypes.length || subtypes.some((s, i) => s !== initialSubtypes[i])
	);
	let isSubtypesCustom = $derived(
		subtypes.length !== defaultTypeLineParts.subtypes.length || subtypes.some((s, i) => s !== defaultTypeLineParts.subtypes[i])
	);

	let isTagsChanged = $derived(
		tags.length !== initialTags.length || tags.some((t, i) => t !== initialTags[i]) || primaryTag !== initialPrimaryTag
	);
	let isTagsCustom = $derived(tags.length > 0);

	// Filtering for Autocomplete dropdowns
	let filteredSupertypes = $derived(
		LEGAL_SUPERTYPES.filter(s => s.toLowerCase().includes(supertypeSearchQuery.toLowerCase()))
	);

	let filteredCardTypes = $derived(
		LEGAL_CARD_TYPES.filter(t => t.toLowerCase().includes(cardTypeSearchQuery.toLowerCase()))
	);

	let filteredSubtypesList = $derived(
		LEGAL_SUBTYPES.filter(s => s.toLowerCase().includes(subtypeSearchQuery.toLowerCase()))
	);
</script>

{#if interactionStore.cardDataModal.isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div 
		class="modal-backdrop" 
		transition:fade={{ duration: 150 }}
		onclick={handleClose}
	>
		<div 
			class="modal-content" 
			transition:scale={{ duration: 200, start: 0.98 }}
			onclick={(e) => e.stopPropagation()}
		>
			<button class="close-btn" onclick={handleClose} aria-label="Close">
				<X size={16} />
			</button>

			<div class="modal-header">
				<h3 class="text-lg font-semibold tracking-tight">Change Card Data</h3>
				<p class="text-sm text-muted-foreground">{card?.name}</p>
			</div>

			<div class="modal-body">
				
				<!-- CMC field -->
				<div class="form-group">
					<label for="card-cmc">Mana Value (CMC)</label>
					<Input
						id="card-cmc"
						type="number"
						bind:value={cmc}
						min="0"
						max="99"
						class={isCmcChanged ? 'text-blue' : (isCmcCustom ? 'text-white' : 'text-muted')}
						onkeydown={(e) => {
							if (e.key === "Enter") handleSubmit();
							if (e.key === "Escape") handleClose();
						}}
					/>
				</div>

				<!-- Supertypes Pillbox -->
				<div class="form-group">
					<label class={isSupertypesChanged ? 'label-blue' : (isSupertypesCustom ? 'label-white' : 'label-muted')}>Supertypes</label>
					<div class="pillbox-container">
						{#each supertypes as item}
							<div class="type-pill supertype-pill">
								<span>{item}</span>
								<button type="button" class="pill-remove-btn" onclick={() => toggleSupertype(item)} aria-label="Remove">
									<X size={10} />
								</button>
							</div>
						{/each}
						
						<!-- Add Supertype Palette Anchor -->
						<div class="palette-anchor">
							<button 
								type="button" 
								class="add-pill-trigger-btn"
								onclick={() => showSupertypeDropdown = !showSupertypeDropdown}
							>
								<Plus size={12} /> Add Supertype
							</button>

							{#if showSupertypeDropdown}
								<div class="palette-popover">
									<div class="dropdown-backdrop" role="presentation" onclick={() => showSupertypeDropdown = false}></div>
									<div class="palette-search-container">
										<Search size={14} class="search-icon" />
										<input 
											type="text" 
											placeholder="Search supertypes..." 
											bind:value={supertypeSearchQuery}
											focus
										/>
									</div>
									<div class="palette-items-list">
										{#each filteredSupertypes as item}
											<button 
												type="button" 
												class="palette-item-option"
												onclick={() => {
													toggleSupertype(item);
													showSupertypeDropdown = false;
												}}
											>
												<span>{item}</span>
												{#if supertypes.includes(item)}
													<Check size={14} class="check-icon text-blue-500" />
												{/if}
											</button>
										{:else}
											<span class="no-options-placeholder">No matching supertypes</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Card Types Pillbox -->
				<div class="form-group">
					<label class={isCardTypesChanged ? 'label-blue' : (isCardTypesCustom ? 'label-white' : 'label-muted')}>Card Types</label>
					<div class="pillbox-container">
						{#each cardTypes as item}
							<div class="type-pill type-pill-bg">
								<span>{item}</span>
								<button type="button" class="pill-remove-btn" onclick={() => toggleCardType(item)} aria-label="Remove">
									<X size={10} />
								</button>
							</div>
						{/each}
						
						<!-- Add Card Type Palette Anchor -->
						<div class="palette-anchor">
							<button 
								type="button" 
								class="add-pill-trigger-btn"
								onclick={() => showCardTypeDropdown = !showCardTypeDropdown}
							>
								<Plus size={12} /> Add Card Type
							</button>

							{#if showCardTypeDropdown}
								<div class="palette-popover">
									<div class="dropdown-backdrop" role="presentation" onclick={() => showCardTypeDropdown = false}></div>
									<div class="palette-search-container">
										<Search size={14} class="search-icon" />
										<input 
											type="text" 
											placeholder="Search types..." 
											bind:value={cardTypeSearchQuery}
										/>
									</div>
									<div class="palette-items-list">
										{#each filteredCardTypes as item}
											<button 
												type="button" 
												class="palette-item-option"
												onclick={() => {
													toggleCardType(item);
													showCardTypeDropdown = false;
												}}
											>
												<span>{item}</span>
												{#if cardTypes.includes(item)}
													<Check size={14} class="check-icon text-blue-500" />
												{/if}
											</button>
										{:else}
											<span class="no-options-placeholder">No matching card types</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Subtypes Pillbox with Autocomplete Enforced Validation -->
				<div class="form-group">
					<label class={isSubtypesChanged ? 'label-blue' : (isSubtypesCustom ? 'label-white' : 'label-muted')}>Subtypes</label>
					<div class="pillbox-container">
						{#each subtypes as item}
							<div class="type-pill subtype-pill">
								<span>{item}</span>
								<button type="button" class="pill-remove-btn" onclick={() => removeSubtype(item)} aria-label="Remove">
									<X size={10} />
								</button>
							</div>
						{/each}
						
						<!-- Add Subtype Palette Anchor -->
						<div class="palette-anchor">
							<button 
								type="button" 
								class="add-pill-trigger-btn"
								onclick={() => {
									showSubtypeDropdown = !showSubtypeDropdown;
									subtypeValidationError = "";
								}}
							>
								<Plus size={12} /> Add Subtype
							</button>

							{#if showSubtypeDropdown}
								<div class="palette-popover">
									<div class="dropdown-backdrop" role="presentation" onclick={() => showSubtypeDropdown = false}></div>
									<div class="palette-search-container">
										<Search size={14} class="search-icon" />
										<input 
											type="text" 
											placeholder="Search or enter subtype..." 
											bind:value={subtypeSearchQuery}
											onkeydown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													addSubtypeFromSearch();
												}
											}}
										/>
									</div>
									<div class="palette-items-list">
										{#each filteredSubtypesList as item}
											<button 
												type="button" 
												class="palette-item-option"
												onclick={() => {
													if (!subtypes.includes(item)) {
														subtypes = [...subtypes, item];
													}
													subtypeSearchQuery = "";
													subtypeValidationError = "";
													showSubtypeDropdown = false;
												}}
											>
												<span>{item}</span>
												{#if subtypes.includes(item)}
													<Check size={14} class="check-icon text-blue-500" />
												{/if}
											</button>
										{:else}
											<span class="no-options-placeholder">No matching subtypes</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>

					{#if subtypeValidationError}
						<div class="validation-message-row" transition:fade={{ duration: 100 }}>
							<AlertCircle size={12} />
							<span>{subtypeValidationError}</span>
						</div>
					{/if}
				</div>

				<!-- Custom Color Category Select Dropdown -->
				<div class="form-group">
					<label class={isColorChanged ? 'label-blue' : (isColorCustom ? 'label-white' : 'label-muted')}>Color Category</label>
					
					<div class="palette-anchor w-full">
						<button
							type="button"
							class="custom-select-trigger"
							class:text-blue={isColorChanged}
							class:text-white={isColorCustom && !isColorChanged}
							class:text-muted={!isColorCustom && !isColorChanged}
							onclick={() => showColorDropdown = !showColorDropdown}
						>
							<span>
								{colorCategory === "Default" ? "Default (Based on Card Colors)" : colorCategory}
							</span>
							<span class="select-chevron"></span>
						</button>

						{#if showColorDropdown}
							<div class="select-popover">
								<div class="dropdown-backdrop" role="presentation" onclick={() => showColorDropdown = false}></div>
								<div class="select-options-list">
									{#each ["Default", "White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"] as opt}
										<button
											type="button"
											class="select-option-item"
											onclick={() => {
												colorCategory = opt;
												showColorDropdown = false;
											}}
										>
											<div class="option-content">
												{#if opt !== "Default"}
													<span class="color-indicator-circle class-{opt.toLowerCase()}"></span>
												{:else}
													<span class="color-indicator-circle default"></span>
												{/if}
												<span>{opt === "Default" ? "Default (Based on Card Colors)" : opt}</span>
											</div>
											{#if colorCategory === opt}
												<Check size={14} class="check-icon text-blue-500" />
											{/if}
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Tags Editor -->
				<div class="form-group">
					<label for="card-tags" class={isTagsChanged ? 'label-blue' : (isTagsCustom ? 'label-white' : 'label-muted')}>Card Tags</label>
					
					<!-- Active Tags Badges -->
					<div class="active-tags-list">
						{#each tags as tag}
							<div class="tag-badge-pill" class:is-primary={primaryTag === tag}>
								<button 
									type="button" 
									class="primary-star-btn"
									onclick={() => togglePrimary(tag)}
									title={primaryTag === tag ? "Primary tag (click to demote)" : "Make primary tag"}
								>
									<Star size={12} fill={primaryTag === tag ? "currentColor" : "none"} />
								</button>
								<span class="tag-label-text">{tag}</span>
								<button 
									type="button" 
									class="remove-tag-btn" 
									onclick={() => removeTag(tag)}
									aria-label="Remove tag"
								>
									<X size={12} />
								</button>
							</div>
						{:else}
							<span class="no-tags-placeholder">No tags assigned</span>
						{/each}
					</div>

					<!-- Input to Add Tag -->
					<div class="tag-input-row">
						<Input
							id="card-tags"
							type="text"
							placeholder="Add a tag..."
							bind:value={newTagInput}
							onkeydown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addTag();
								}
							}}
						/>
						<Button variant="outline" size="icon" onclick={addTag} aria-label="Add tag">
							<Plus size={16} />
						</Button>
					</div>

					<!-- Suggestions -->
					{#if deckTagsList.some(t => !tags.includes(t))}
						<div class="suggestions-section">
							<span class="suggestions-label">Suggestions:</span>
							<div class="suggestions-list">
								{#each deckTagsList as gTag}
									{#if !tags.includes(gTag)}
										<button 
											type="button" 
											class="suggestion-pill"
											onclick={() => {
												tags.push(gTag);
												if (!primaryTag) primaryTag = gTag;
											}}
										>
											{gTag}
										</button>
									{/if}
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="modal-footer">
				<Button variant="outline" onclick={handleClose}>Cancel</Button>
				<Button variant="default" onclick={handleSubmit}>Confirm</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.modal-content {
		position: relative;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 440px;
		padding: 2.5rem 2rem 2rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		color: hsl(var(--foreground));
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.modal-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.modal-header h3 {
		margin: 0;
		color: hsl(var(--foreground));
	}

	.modal-header p {
		margin: 0.5rem 0 0;
	}

	.modal-body {
		margin-bottom: 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-align: left;
	}

	.form-group label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		transition: color 0.15s;
	}

	.label-blue {
		color: #3b82f6 !important;
	}
	.label-white {
		color: #ffffff !important;
	}
	.label-muted {
		color: hsl(var(--muted-foreground)) !important;
	}

	/* Select styling matching standard ui-input but with chevron spacing */
	.custom-select-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 2.25rem;
		width: 100%;
		border-radius: var(--radius);
		border: 1px solid hsl(var(--border));
		background-color: hsla(var(--input) / 0.3);
		padding: 0 1rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: border-color 0.15s, box-shadow 0.15s;
		color: hsl(var(--foreground));
		outline: none;
		text-align: left;
	}

	.custom-select-trigger:focus-visible {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsla(var(--primary) / 0.2);
	}

	.select-chevron {
		width: 0;
		height: 0;
		border-left: 5px solid transparent;
		border-right: 5px solid transparent;
		border-top: 5px solid hsl(var(--muted-foreground));
		margin-left: 10px;
	}

	.select-popover {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 10100;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
		margin-top: 4px;
		max-height: 240px;
		overflow-y: auto;
	}

	.select-options-list {
		display: flex;
		flex-direction: column;
		padding: 4px;
	}

	.select-option-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: var(--radius-sm);
		width: 100%;
	}

	.select-option-item:hover {
		background: hsl(var(--accent));
	}

	.option-content {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.color-indicator-circle {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid rgba(255,255,255,0.1);
	}

	.color-indicator-circle.class-white { background-color: #fef3c7; }
	.color-indicator-circle.class-blue { background-color: #3b82f6; }
	.color-indicator-circle.class-black { background-color: #1e1b4b; }
	.color-indicator-circle.class-red { background-color: #ef4444; }
	.color-indicator-circle.class-green { background-color: #10b981; }
	.color-indicator-circle.class-multicolor { background: linear-gradient(45deg, #f59e0b, #3b82f6, #10b981); }
	.color-indicator-circle.class-colorless { background-color: #6b7280; }
	.color-indicator-circle.class-lands { background-color: #854d0e; }
	.color-indicator-circle.default { border: 1px dashed hsl(var(--muted-foreground)); }

	/* Palette Popover CSS */
	.palette-anchor {
		position: relative;
	}

	.palette-popover {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 10100;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
		margin-top: 4px;
		width: 200px;
		max-height: 240px;
		display: flex;
		flex-direction: column;
	}

	.dropdown-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: -1;
		background: transparent;
	}

	.palette-search-container {
		display: flex;
		align-items: center;
		padding: 4px 8px;
		border-bottom: 1px solid hsl(var(--border));
		gap: 6px;
	}

	.palette-search-container input {
		background: transparent;
		border: none;
		font-size: 0.75rem;
		color: hsl(var(--foreground));
		outline: none;
		flex: 1;
		padding: 4px 0;
	}

	.palette-items-list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding: 4px;
	}

	.palette-item-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 8px;
		font-size: 0.75rem;
		color: hsl(var(--foreground));
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: var(--radius-sm);
		width: 100%;
	}

	.palette-item-option:hover {
		background: hsl(var(--accent));
	}

	.no-options-placeholder {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 8px;
		font-style: italic;
	}

	/* Pillbox layouts */
	.pillbox-container {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		border: 1px solid hsl(var(--border));
		background-color: hsla(var(--input) / 0.1);
		border-radius: var(--radius-md);
		padding: 0.5rem;
		min-height: 2.25rem;
		align-items: center;
	}

	.type-pill {
		display: inline-flex;
		align-items: center;
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-sm);
		padding: 1px 6px;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		gap: 4px;
	}

	.supertype-pill {
		background: hsla(var(--primary-hsl), 0.1);
		border-color: hsla(var(--primary-hsl), 0.3);
	}

	.type-pill-bg {
		background: hsla(142, 70%, 45%, 0.1);
		border-color: hsla(142, 70%, 45%, 0.3);
	}

	.subtype-pill {
		background: hsla(35, 90%, 50%, 0.1);
		border-color: hsla(35, 90%, 50%, 0.3);
	}

	.pill-remove-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.pill-remove-btn:hover {
		color: hsl(var(--destructive));
	}

	.add-pill-trigger-btn {
		background: transparent;
		border: 1px dashed hsl(var(--border));
		border-radius: var(--radius-sm);
		padding: 1px 6px;
		font-size: 0.725rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.add-pill-trigger-btn:hover {
		border-color: hsl(var(--primary));
		color: hsl(var(--foreground));
	}

	.validation-message-row {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #f87171;
		font-size: 0.6875rem;
		margin-top: 2px;
	}

	/* Text color themes based on default, custom/saved override, or dirty edited state */
	:global(.ui-input.text-blue), select.text-blue {
		color: #3b82f6 !important;
	}
	:global(.ui-input.text-white), select.text-white {
		color: #ffffff !important;
	}
	:global(.ui-input.text-muted), select.text-muted {
		color: hsl(var(--muted-foreground)) !important;
	}

	/* Tags Editor specific styles */
	.active-tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
		min-height: 1.5rem;
		align-items: center;
	}

	.no-tags-placeholder {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.tag-badge-pill {
		display: inline-flex;
		align-items: center;
		background: hsla(var(--muted) / 0.4);
		border: 1px solid hsla(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		gap: 4px;
	}

	.tag-badge-pill.is-primary {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.4);
		color: hsl(var(--primary));
	}

	.primary-star-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.tag-badge-pill.is-primary .primary-star-btn {
		color: hsl(var(--primary));
	}

	.tag-badge-pill:hover .primary-star-btn {
		color: hsl(var(--foreground));
	}

	.remove-tag-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.remove-tag-btn:hover {
		color: hsl(var(--destructive));
	}

	.tag-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.suggestions-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}

	.suggestions-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}

	.suggestions-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.suggestion-pill {
		background: hsla(var(--muted) / 0.25);
		border: 1px solid hsla(var(--border) / 0.3);
		border-radius: var(--radius-sm);
		padding: 1px 5px;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.1s;
	}

	.suggestion-pill:hover {
		background: hsla(var(--muted) / 0.5);
		color: hsl(var(--foreground));
	}

	.modal-footer {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
</style>
