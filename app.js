const request = require('request');
var fs = require("fs");

var args = process.argv.slice(2);
console.log(args);

// 
const hero_ids = require("./heroes.json")
const ability_ids = require("./abilites_data.json")

function getAbilityName(id){
	var name_to_return = "unknown";
	Object.keys(ability_ids['DOTAAbilities']).forEach(function(key,index) {
		// console.log(key, ability_ids['DOTAAbilities'][key]["ID"]);
		if (parseInt(ability_ids['DOTAAbilities'][key]["ID"]) == id) {
			name_to_return = key;
		}
	});

	return name_to_return;
}


var matches = require("./matches.json");

// Step 1: Get all AD matches
// player_id bukka: 91945506
if (~args.indexOf('get_matches') || matches.length == 0) {
	request('https://api.opendota.com/api/players/91945506/matches?significant=0&game_mode=18', { json: true }, (err, res, body) => {
		if (err) { return console.log(err); }
		fs.writeFile( "matches.json", JSON.stringify( res.body , null, 4 ), "utf8", function(){
			console.log("Saved matches locally");
		});
	});
}else{
	console.log('Using local matches');
}


// Step 2: Get stats for each match
// 
function getMatchStats(i){
	if (matches[i]['parsed']) {
		console.log(matches[i]['match_id'], ' already parsed.');
		if (i+1 < matches.length) {
			getMatchStats(i+1)
		}else{
			console.log("Done");
		}
	}else{
		request('https://api.opendota.com/api/matches/'+matches[i]['match_id'], { json: true }, (err, res, body) => {
			if (err) { return console.log(err); }

			var player_data = [] 

			if (res.body['players']) {
				for (var k = 0; k < res.body['players'].length; k++) {
					var player = res.body['players'][k]

					var won = false;
					if (player['player_slot'] < 5) {
						if (res.body['radiant_win']) {
							won = true;
						}
					}else{
						if (res.body['radiant_win'] == false) {
							won = true;
						}
					}

					player_data.push({
						"account_id" : player['account_id'],
						"personaname" : player['personaname'],
						"player_slot" : player['player_slot'],
						"hero_id" : player['hero_id'],
						"ability_upgrades_arr" : player['ability_upgrades_arr'],
						"item_0" : player['item_0'],
						"item_1" : player['item_1'],
						"item_2" : player['item_2'],
						"item_3" : player['item_3'],
						"item_4" : player['item_4'],
						"item_5" : player['item_5'],
						"item_neutral" : player['item_neutral'],
						"won" : won,
					})
				}


				matches[i]['parsed_data'] = player_data;
				matches[i]['parsed'] = true;
			}else{
				console.log("No player data available");
				//Request to parse a match
				request.post('https://api.opendota.com/api/request/'+matches[i]['match_id'], { json: true }, (err, res, body) => {
					if (err) { return console.log(err); }
					console.log("Requesting to parse: ", matches[i]['match_id']);
				});

				matches[i]['parsed'] = false;
			}

			fs.writeFile( "matches.json", JSON.stringify( matches , null, 4 ), "utf8", function(){
				console.log("Parsed match:", matches[i]['match_id']);
				console.log("Waiting...");
				// Wait 1s before making another call due to OpenDota limits
				setTimeout(function(){
					if (i+1 < matches.length) {
						getMatchStats(i+1)
					}else{
						console.log("Done");
					}
				}, 1000)
			});
		});
	}
}


if (~args.indexOf('parse_matches')){
	getMatchStats(0)
}





// Compute hero win rates
var heroes = [];

function selectHero(hero_id){
	var hero_to_return = false;

	for (var i = 0; i < heroes.length; i++) {
		if(heroes[i]['id'] == hero_id){
			hero_to_return = heroes[i];
		}
	}

	if (hero_to_return == false) {
		console.log('Creating hero', hero_id);
		heroes.push({
			'id' : hero_id,
			'name' : hero_ids[hero_id],
			'win' : 0,
			'lose' : 0
		})
		hero_to_return = heroes[heroes.length - 1];
	}
	return hero_to_return;
}

for (var i = 0; i < matches.length; i++) {
	var match = matches[i];

	if (match['parsed']) {

		for (var k = 0; k < match['parsed_data'].length; k++) {
			var player = match['parsed_data'][k];

			var hero = selectHero(player['hero_id'])

			if (player['won']) {
				hero['win']++
			}else{
				hero['lose'] ++
			}
		}
	}
}

// Calculate win % for heroes
for (var i = 0; i < heroes.length; i++) {
	var hero = heroes[i];
	var total_games = hero['win'] + hero['lose'];

	var win_rate = Math.round(hero['win'] / total_games * 100);
	var adj_win_rate = Math.round(hero['win'] / Math.max(total_games, 30) * 100);

	hero['games'] = total_games; 
	hero['win_rate'] = win_rate; 
	hero['adj_win_rate'] = adj_win_rate; 
}

heroes.sort(function(a, b) {
    return a.adj_win_rate - b.adj_win_rate;
});
heroes.reverse();

fs.writeFile( "hero_stats.json", JSON.stringify( heroes , null, 4 ), "utf8", function(){
	console.log("Saved hero stats");
});

console.log(heroes);



// Compute ability win rates

var abilities = [];

function selectAbility(ability_id){
	var ability_to_return = false;

	for (var i = 0; i < abilities.length; i++) {
		if(abilities[i]['id'] == ability_id){
			ability_to_return = abilities[i];
		}
	}

	if (ability_to_return == false) {
		console.log('Creating ability', ability_id);
		abilities.push({
			'id' : ability_id,
			'name' : getAbilityName(ability_id),
			'win' : 0,
			'lose' : 0
		})
		ability_to_return = abilities[abilities.length - 1];
	}
	return ability_to_return;
}


for (var i = 0; i < matches.length; i++) {
	var match = matches[i];

	if (match['parsed']) {

		for (var k = 0; k < match['parsed_data'].length; k++) {
			var player = match['parsed_data'][k];

			if (player['ability_upgrades_arr']) {

				var ability_arr = uniq = [...new Set(player['ability_upgrades_arr'])];

				for (var p = 0; p < ability_arr.length; p++) {
					if (getAbilityName(ability_arr[p]).indexOf('special') === -1) {

						var ability = selectAbility(ability_arr[p]);

						if (player['won']) {
							ability['win']++
						}else{
							ability['lose'] ++
						}
					}
				}
			}

		}
	}
}

// Calculate win % for abilities
for (var i = 0; i < abilities.length; i++) {
	var ability = abilities[i];
	var total_games = ability['win'] + ability['lose'];

	var win_rate = Math.round(ability['win'] / total_games * 100);
	var adj_win_rate = Math.round(ability['win'] / Math.max(total_games, 30) * 100);

	ability['games'] = total_games; 
	ability['win_rate'] = win_rate; 
	ability['adj_win_rate'] = adj_win_rate; 
}

abilities.sort(function(a, b) {
    return a.adj_win_rate - b.adj_win_rate;
});
abilities.reverse();


console.log(abilities);


// Save to db file

var db = {
	'heroes' : heroes,
	'abilities' : abilities
}

fs.writeFile( "db.json", JSON.stringify( db, null, 4 ), "utf8", function(){
	console.log("Saved db");
});
