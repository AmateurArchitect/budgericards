const inputText = `1 Ajani, Nacatl Pariah (MH3) 237
1 Armageddon
1 Chandra, Torch of Defiance
1 Court of Garenbrig
1 Death-Greeter's Champion
1 Esper Sentinel
1 Fable of the Mirror-Breaker (NEO) 141
1 Figure of Fable
1 Flooded Strand
2 Forest (FDN) 280
1 Generous Plunderer
1 Get Lost
1 Giver of Runes
1 Guide of Souls
1 Icetill Explorer
1 Karakas
1 Knight of the Reliquary
1 Library of Alexandria
1 Llanowar Elves
1 Luminarch Aspirant
1 Mana Crypt
2 Mountain
1 Mox Ruby
2 Plains
1 Prismatic Vista
1 Reprieve
1 Savannah
1 Shifting Woodland
1 Skyclave Apparition
1 Spider-Woman, Stunning Savior
1 Stomping Ground
1 Swords to Plowshares
1 Temple Garden
1 Titania, Protector of Argoth
1 Windswept Heath
1 Wooded Foothills`;

const isSearch = 
	inputText.startsWith("/") ||
	inputText.startsWith("?") ||
	(inputText.includes(":") &&
		!/\r|\n/.test(inputText) &&
		!/^\s*\d+/.test(inputText) &&
		!inputText.startsWith("//") &&
		!inputText.startsWith("#"));

console.log("isSearch:", isSearch);
