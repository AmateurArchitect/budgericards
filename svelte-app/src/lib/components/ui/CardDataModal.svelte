<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import { X, Star, Search, AlertCircle, Check, Plus } from "lucide-svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { untrack } from "svelte";

	// --- Legal Magic: The Gathering Vocabulary Lists ---
	const LEGAL_SUPERTYPES = ["Basic", "Legendary", "Snow", "World", "Ongoing"];
	
	const LEGAL_CARD_TYPES = [
		"Creature", "Land", "Artifact", "Enchantment", "Instant", 
		"Sorcery", "Planeswalker", "Battle", "Kindred", "Tribal"
	];

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

	const ALL_LEGAL_WORDS = [...LEGAL_SUPERTYPES, ...LEGAL_CARD_TYPES, ...LEGAL_SUBTYPES];

	// --- Component States ---
	let cmc = $state(0);
	let colorCategory = $state("Default");

	// Type Line State
	let typeLine = $state("");

	// Local tags state
	/** @type {string[]} */
	let tags = $state([]);
	/** @type {string | null} */
	let primaryTag = $state(null);
	let newTagInput = $state("");
	let cursorPos = $state(0);

	// Control dropdown/autocomplete visibilities
	let showColorDropdown = $state(false);
	let showTypeSuggestions = $state(false);

	// Track initial values for styling
	let initialCmc = $state(0);
	let initialColorCategory = $state("Default");
	let initialTypeLine = $state("");
	/** @type {string[]} */
	let initialTags = $state([]);
	/** @type {string | null} */
	let initialPrimaryTag = $state(null);

	let card = $derived(interactionStore.cardDataModal.card);

	// Derived defaults from database metadata
	let defaultCmc = $derived(card ? (deckStore.metadata[card.name.toLowerCase()]?.cmc ?? card.cmc ?? 0) : 0);

	// Derived defaults for type line
	let defaultTypeLine = $derived(card ? (card.type_line || deckStore.metadata[card.name.toLowerCase()]?.type_line || "") : "");

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

	// Image Preview URL resolver
	let imgUrl = $derived.by(() => {
		if (!card) return "";
		const metadata = deckStore.metadata[card.name.toLowerCase()] || {};
		return card.image_uris?.normal || 
			(card.card_faces && card.card_faces[0]?.image_uris?.normal) ||
			metadata.image_uris?.normal ||
			(metadata.card_faces && metadata.card_faces[0]?.image_uris?.normal) ||
			"";
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

					typeLine = overrides.primaryType !== undefined 
						? overrides.primaryType 
						: (card.type_line || metadata.type_line || "");

					tags = card.tags ? [...card.tags] : [];
					primaryTag = card.primaryTag || (tags[0] || null);

					// Initialize initial state references
					initialCmc = cmc;
					initialColorCategory = colorCategory;
					initialTypeLine = typeLine;
					initialTags = [...tags];
					initialPrimaryTag = primaryTag;

					// Reset palette states
					newTagInput = "";
					showColorDropdown = false;
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

		// Auto-save tag input text if user hasn't pressed enter
		const val = newTagInput.trim();
		if (val && !tags.includes(val)) {
			tags.push(val);
			if (!primaryTag) {
				primaryTag = val;
			}
		}

		// 1. CMC Override
		const parsedCmc = parseInt(String(cmc), 10);
		if (!isNaN(parsedCmc)) {
			deckStore.setCardOverride(cardId, 'manaValue', parsedCmc);
		}

		// 2. Type Override
		deckStore.setCardOverride(cardId, 'primaryType', formatTypeLine(typeLine).trim());

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

	// --- Resets ---
	function resetCmcField() {
		cmc = defaultCmc;
	}

	function resetTypeLineFields() {
		typeLine = defaultTypeLine;
	}

	function resetColorCategoryField() {
		colorCategory = "Default";
	}

	function resetTagsField() {
		tags = [];
		primaryTag = null;
	}

	function resetAllFields() {
		resetCmcField();
		resetTypeLineFields();
		resetColorCategoryField();
		resetTagsField();
	}

	// --- Helper actions for adding/removing tag array values ---
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

	let isTypeLineChanged = $derived(typeLine !== initialTypeLine);
	let isTypeLineCustom = $derived(typeLine !== defaultTypeLine);

	let isTagsChanged = $derived(
		tags.length !== initialTags.length || tags.some((t, i) => t !== initialTags[i]) || primaryTag !== initialPrimaryTag
	);
	let isTagsCustom = $derived(tags.length > 0);

	let isAnyFieldCustom = $derived(isCmcCustom || isTypeLineCustom || isColorCustom || isTagsCustom);

	// Autocomplete word check & validation helpers
	let currentWord = $derived.by(() => {
		if (!typeLine) return "";
		const words = typeLine.split(/[\s—\-]+/);
		return words[words.length - 1] || "";
	});

	let suggestions = $derived.by(() => {
		const word = currentWord.trim();
		if (!word || word.length < 1) return [];
		return ALL_LEGAL_WORDS.filter(w => 
			w.toLowerCase().startsWith(word.toLowerCase()) && 
			w.toLowerCase() !== word.toLowerCase()
		).slice(0, 5);
	});

	let invalidWords = $derived.by(() => {
		if (!typeLine) return [];
		
		const wordRegex = /[a-zA-Z0-9']+/g;
		let match;
		const wordsWithIndices = [];
		while ((match = wordRegex.exec(typeLine)) !== null) {
			wordsWithIndices.push({
				word: match[0],
				start: match.index,
				end: match.index + match[0].length
			});
		}

		return wordsWithIndices
			.filter(({ word, start, end }) => {
				const isCursorInWord = cursorPos >= start && cursorPos <= end;
				if (isCursorInWord) {
					return false;
				}
				const isLegal = ALL_LEGAL_WORDS.some(x => x.toLowerCase() === word.toLowerCase());
				return !isLegal;
			})
			.map(w => w.word);
	});

	/** @param {string} val */
	function selectSuggestion(val) {
		const trimmed = typeLine;
		const lastWordRegex = /[a-zA-Z0-9']+(?!.*[a-zA-Z0-9'])/;
		const match = trimmed.match(lastWordRegex);
		if (match) {
			const index = trimmed.lastIndexOf(match[0]);
			typeLine = trimmed.substring(0, index) + val + " ";
		} else {
			typeLine = trimmed + val + " ";
		}
		showTypeSuggestions = false;
	}

	/** @param {string} rawString */
	function formatTypeLine(rawString) {
		const words = rawString.split(/[\s—\-]+/).filter(Boolean);
		/** @type {string[]} */
		const parsedSupertypes = [];
		/** @type {string[]} */
		const parsedCardTypes = [];
		/** @type {string[]} */
		const parsedSubtypes = [];
		
		for (const w of words) {
			const normalized = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
			if (LEGAL_SUPERTYPES.includes(normalized)) {
				if (!parsedSupertypes.includes(normalized)) parsedSupertypes.push(normalized);
			} else if (LEGAL_CARD_TYPES.includes(normalized)) {
				if (!parsedCardTypes.includes(normalized)) parsedCardTypes.push(normalized);
			} else {
				const matchedSubtype = LEGAL_SUBTYPES.find(x => x.toLowerCase() === w.toLowerCase());
				const val = matchedSubtype || normalized;
				if (!parsedSubtypes.includes(val)) parsedSubtypes.push(val);
			}
		}
		
		let left = [...parsedSupertypes, ...parsedCardTypes].join(" ");
		let result = left;
		if (parsedSubtypes.length > 0) {
			result = `${left} — ${parsedSubtypes.join(" ")}`;
		}
		return result;
	}
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
			onclick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}
		>
			<button class="close-btn" onclick={handleClose} aria-label="Close">
				<X size={16} />
			</button>

			<div class="modal-layout-container">
				
				<!-- Left Column: Card Image Preview -->
				<div class="card-preview-column">
					{#if imgUrl}
						<img src={imgUrl} alt={card?.name || "Card art crop"} class="card-preview-img" />
					{:else}
						<div class="card-preview-placeholder">
							<span class="text-sm text-muted-foreground">No image available</span>
						</div>
					{/if}
				</div>

				<!-- Right Column: Form Editor Inputs -->
				<div class="editor-form-column">
					
					<div class="modal-header">
						<span class="modal-subtitle">Edit Card Data</span>
						<h3 class="modal-title">{card?.name}</h3>
					</div>

					<div class="modal-body">
						
						<!-- CMC field -->
						<div class="form-group">
							<div class="label-row">
								<label for="card-cmc">Mana Value (CMC)</label>
								{#if isCmcCustom}
									<button type="button" class="field-reset-action" onclick={resetCmcField}>Reset to Default</button>
								{/if}
							</div>
							<Input
								id="card-cmc"
								type="number"
								bind:value={cmc}
								min="0"
								max="99"
								class={isCmcChanged ? 'text-blue' : (isCmcCustom ? 'text-white' : 'text-muted')}
								onkeydown={(/** @type {KeyboardEvent} */ e) => {
									if (e.key === "Enter") handleSubmit();
									if (e.key === "Escape") handleClose();
								}}
							/>
						</div>

						<!-- Type Line field -->
						<div class="form-group">
							<div class="label-row">
								<label for="card-typeline" class={isTypeLineChanged ? 'label-blue' : (isTypeLineCustom ? 'label-white' : 'label-muted')}>Type Line</label>
								{#if isTypeLineCustom}
									<button type="button" class="field-reset-action" onclick={resetTypeLineFields}>Reset to Default</button>
								{/if}
							</div>
							<div class="palette-anchor w-full">
								<Input
									id="card-typeline"
									type="text"
									bind:value={typeLine}
									class={isTypeLineChanged ? 'text-blue' : (isTypeLineCustom ? 'text-white' : 'text-muted')}
									onfocus={(e) => {
										showTypeSuggestions = true;
										cursorPos = e.currentTarget.selectionStart || 0;
									}}
									onblur={() => setTimeout(() => showTypeSuggestions = false, 150)}
									oninput={(e) => {
										cursorPos = e.currentTarget.selectionStart || 0;
									}}
									onclick={(e) => {
										cursorPos = e.currentTarget.selectionStart || 0;
									}}
									onkeyup={(e) => {
										cursorPos = e.currentTarget.selectionStart || 0;
									}}
									onkeydown={(/** @type {KeyboardEvent} */ e) => {
										if (e.key === "Enter") handleSubmit();
										if (e.key === "Escape") handleClose();
									}}
								/>

								{#if showTypeSuggestions && suggestions.length > 0}
									<div class="palette-popover">
										<div class="palette-items-list">
											{#each suggestions as item}
												<button 
													type="button" 
													class="palette-item-option"
													onmousedown={() => {
														selectSuggestion(item);
													}}
												>
													<span>{item}</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>

							{#if invalidWords.length > 0}
								<div class="validation-message-row" transition:fade={{ duration: 100 }}>
									<AlertCircle size={12} />
									<span>Invalid word{invalidWords.length > 1 ? 's' : ''}: {invalidWords.join(', ')}</span>
								</div>
							{/if}
						</div>

						<!-- Custom Color Category Select Dropdown -->
						<div class="form-group">
							<div class="label-row">
								<span class="form-label {isColorChanged ? 'label-blue' : (isColorCustom ? 'label-white' : 'label-muted')}">Color Category</span>
								{#if isColorCustom}
									<button type="button" class="field-reset-action" onclick={resetColorCategoryField}>Reset to Default</button>
								{/if}
							</div>
							
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
							<div class="label-row">
								<label for="card-tags" class={isTagsChanged ? 'label-blue' : (isTagsCustom ? 'label-white' : 'label-muted')}>Card Tags</label>
								{#if isTagsCustom}
									<button type="button" class="field-reset-action" onclick={resetTagsField}>Clear Tags</button>
								{/if}
							</div>
							
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
								{/each}
							</div>

							<!-- Input to Add Tag -->
							<div class="tag-input-row">
								<div class="tag-input-container">
									<Input
										id="card-tags"
										type="text"
										placeholder="Add a tag..."
										bind:value={newTagInput}
										onkeydown={(/** @type {KeyboardEvent} */ e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												addTag();
											}
										}}
									/>
									{#if newTagInput.trim()}
										<span class="enter-hint" transition:fade={{ duration: 100 }}>
											press <kbd class="enter-kbd">Enter</kbd>
										</span>
									{/if}
								</div>
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

					<div class="modal-footer-row">
						{#if isAnyFieldCustom}
							<Button variant="ghost" onclick={resetAllFields} class="text-muted-foreground hover:text-foreground">Reset All</Button>
						{/if}
						<div class="footer-actions-right">
							<Button variant="outline" onclick={handleClose}>Cancel</Button>
							<Button variant="default" onclick={handleSubmit}>Confirm</Button>
						</div>
					</div>

				</div>

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
		max-width: 720px;
		padding: 2rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		color: hsl(var(--foreground));
	}

	.modal-layout-container {
		display: flex;
		gap: 2rem;
	}

	/* Left Column: Image Preview Styles */
	.card-preview-column {
		width: 220px;
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}

	.card-preview-img {
		width: 100%;
		border-radius: 4.75% / 3.5%;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
		display: block;
	}

	.card-preview-placeholder {
		width: 100%;
		aspect-ratio: 2.5 / 3.5;
		background: hsla(var(--muted) / 0.15);
		border: 1px dashed hsl(var(--border));
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 1rem;
	}

	/* Right Column: Form Styles */
	.editor-form-column {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
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
		text-align: left;
		margin-bottom: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.modal-subtitle {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.modal-title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.25;
		color: hsl(var(--foreground));
	}

	.modal-body {
		margin-bottom: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		overflow-y: auto;
		max-height: 480px;
		padding-right: 4px;
	}

	.modal-body::-webkit-scrollbar {
		width: 5px;
	}
	.modal-body::-webkit-scrollbar-thumb {
		background: hsla(var(--muted) / 0.3);
		border-radius: 3px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-align: left;
	}

	.label-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.form-group label, .form-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		transition: color 0.15s;
	}

	.field-reset-action {
		background: transparent;
		border: none;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
	}

	.field-reset-action:hover {
		color: hsl(var(--foreground));
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



	/* Custom select dropdown styling */
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
		display: inline-flex;
		flex: 1 1 auto;
	}

	.palette-popover {
		position: absolute;
		bottom: 100%;
		left: 0;
		z-index: 10100;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
		margin-bottom: 4px;
		width: 200px;
		max-height: 180px;
		display: flex;
		flex-direction: column;
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

	/* Pillbox input styles */
	.pillbox-container {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		border: 1px solid hsl(var(--border));
		background-color: hsla(var(--input) / 0.15);
		border-radius: var(--radius-sm);
		padding: 0.375rem;
		min-height: 2rem;
		align-items: center;
	}

	.type-pill {
		display: inline-flex;
		align-items: center;
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-sm);
		padding: 1px 5px;
		font-size: 0.725rem;
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

	.inline-pill-input {
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.725rem;
		color: hsl(var(--foreground));
		padding: 2px 4px;
		width: 100%;
		min-width: 70px;
	}

	.inline-pill-input::placeholder {
		color: hsl(var(--muted-foreground));
		opacity: 0.7;
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
	:global(.ui-input.text-blue) {
		color: #3b82f6 !important;
	}
	:global(.ui-input.text-white) {
		color: #ffffff !important;
	}
	:global(.ui-input.text-muted) {
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

	.tag-input-container {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}

	.enter-hint {
		position: absolute;
		right: 0.75rem;
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground));
		pointer-events: none;
		background: hsl(var(--muted) / 0.8);
		padding: 2px 6px;
		border-radius: 3px;
		border: 1px solid hsl(var(--border));
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.enter-kbd {
		font-family: inherit;
		font-weight: 600;
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

	/* Footer Row */
	.modal-footer-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 1rem;
	}

	.footer-actions-right {
		display: flex;
		gap: 0.75rem;
	}
</style>
