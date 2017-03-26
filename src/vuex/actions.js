import * as types from './types'
import router from 'src/router'
import DateLib from 'src/lib/DateLib'
import { API, ITEM_MAP, HERO_MAP, HEROS, ITEMS, RUNE_MAP } from 'src/constants'
import { percentify, polling, localData, parsePositions } from 'src/util'


export function auth({commit}) {
	commit(types.AUTH)
}


// 装载本地数据
export function loadLocalData({commit, state}) {
	if (state.status.dev) {
		commit(types.GET_USERS_FETCH_SUCCESS, require('src/../.data/players.json'))
		commit(types.GET_MATCHES_FETCH_SUCCESS, handleMatches(require('src/../.data/matches.json')))
		const match = require('src/../.data/match.detail.json')
		match.logs = getLogs(match)
		commit(types.GET_MATCH_FETCH_SUCCESS, handleMatch(match))
	}
	const data = {}
	data.users = localData.get('users') || []
	commit(types.LOAD_LOCALSTORAGE, data)
}

export function removeLocalData({commit}, key) {
	localData.remove(key)
	window.confirm('确认是否清空历史记录') && commit(types.LOAD_LOCALSTORAGE, {users: []})
}

// status
export function changeUserName({commit}, val) {
	commit(types.CHANGE_USER_NAME, val)
}

// users
export async function getUsersFetch({commit, dispatch}, name) {
	if (/\d+/.test(name)) {
		const user = await API.fetch(API.players._, {param: name})
		dispatch('getMatchesFetch', user.profile)
	} else {
		const users = await API.fetch(API.search, {query: {q: name}})
		commit(types.GET_USERS_FETCH_SUCCESS, users)
	}
}

// match
export async function getMatchesFetch({commit, state}, user) {
	// const userid = state.users[state.status.selectUserIndex].account_id
	const matches = await API.fetch(API.players.matches, {param: user.account_id})
	commit(types.GET_MATCHES_FETCH_SUCCESS, handleMatches(matches))
	router.push('/userinfo')
	localData.update('users', users => {
		if (users) {
			users.every(v => v.account_id !== user.account_id) && users.push(user)
			return users
		} else {
			return [user]
		}
	})
}

export async function getMatchFetch({commit, dispatch}, matchid) {
	const matchDetails = localData.get('matchDetails')
	let match, logs

	if (matchDetails) {
		match = matchDetails[matchid]
	}

	if (!match) {
		match = await API.fetch(API.matches, {param: matchid})
	}

	try {
		logs = getLogs(match)
		// isDetail
		if (logs) {
			localData.update('matchDetails', (v) => {
				v = v || {}
				v[matchid] = match
				return v
			})
		}
		match.logs = logs
	} catch(e) {
		const result = window.confirm('尚无完整比赛信息，是否解析？\n（过程需要几分钟，请耐心等候...）')
		if (result) {
			return dispatch('getMatchDetailFetch', matchid)
		} else {
			match.logs = []
		}
	}
	match = handleMatch(match)
	commit(types.GET_MATCH_FETCH_SUCCESS, match)
	router.push('/match/summary')
}

export async function getMatchDetailFetch({dispatch}, matchid) {
	let json = API.fetch(API.request.job, {param: matchid, method: 'post'})

	if (json.state === 'failed') {
		return alert('解析失败')
	}

	polling(async (done) => {
		json = await API.fetch(API.request.match, {param: json.job.jobId})
		if (json.state === 'active') {
			console.log(json.progress)
		} else if (json.state === 'completed') {
			done()
			dispatch('getMatchFetch', matchid)
		} else {
			done()
			alert('解析失败')
		}
	}, 3000)
}

// handlers
function handleMatches(matches) {
	return matches.map(match => {
		match.hero_img = API.IMG_HOST + HERO_MAP[match.hero_id].img
		match.win = match.player_slot < 5 ? match.radiant_win : !match.radiant_win
		match.from_now = DateLib.fromNow(new Date(match.start_time * 1000))
		match.parsed = !!match.version
		return match
	})
}

function handleMatch(match) {
	match.from_now = DateLib.fromNow(new Date(match.start_time * 1000))
	match.duration = DateLib.duration(match.duration)
	match.players.forEach(v => {
		v.hero_img = API.HOST + HERO_MAP[v.hero_id].img
		v.item_0 = API.HOST + (ITEM_MAP[v.item_0] || {}).img
		v.item_1 = API.HOST + (ITEM_MAP[v.item_1] || {}).img
		v.item_2 = API.HOST + (ITEM_MAP[v.item_2] || {}).img
		v.item_3 = API.HOST + (ITEM_MAP[v.item_3] || {}).img
		v.item_4 = API.HOST + (ITEM_MAP[v.item_4] || {}).img
		v.item_5 = API.HOST + (ITEM_MAP[v.item_5] || {}).img
	})

	match.radiant_players = []
	match.dire_players = []
	match.players.forEach(v => {
		if (v.isRadiant) {
			v.fight_ratio = percentify((v.assists + v.kills) / match.radiant_score)
			match.radiant_players.push(v)
		} else {
			v.fight_ratio = percentify((v.assists + v.kills) / match.dire_score)
			match.dire_players.push(v)
		}
	})
	match.radiant_damage = match.radiant_players.reduce((p, v) => p + v.hero_damage, 0)
	match.dire_damage = match.dire_players.reduce((p, v) => p + v.hero_damage, 0)
	match.radiant_players.forEach(v => {
		v.damage_percent = percentify(v.hero_damage / match.radiant_damage)
	})
	match.dire_players.forEach(v => {
		v.damage_percent = percentify(v.hero_damage / match.dire_damage)
	})
	return match
}

function getLogs(match) {
	let logs = [], player_imgs = []
	// match.objectives.forEach(v => {
	// 	v.isRadiant = v.player_slot < 5
	// 	v.incident = zh_CN[v.type]
	// 	logs.push(v)
	// })
	match.players.forEach(v => {
		const hero_img = API.HOST + HERO_MAP[v.hero_id].img
		const hero_icon = API.HOST + HERO_MAP[v.hero_id].icon
		const isRadiant = v.isRadiant

		player_imgs.push({
			hero_img,
			hero_icon
		})

		v.kills_log.forEach(w => {
			logs.push({
				type: 'kill',
				kills_hero_img: API.IMG_HOST + HEROS[w.key].img,
				time: w.time,
				hero_img,
				isRadiant
			})
		})
		v.purchase_log.forEach(w => {
			logs.push({
				type: 'purchase',
				item_img: API.IMG_HOST + ITEMS[w.key].img,
				time: w.time,
				cost: ITEMS[w.key].cost,
				hero_img,
				isRadiant
			})
		})
		v.runes_log.forEach(w => {
			logs.push({
				type: 'rune',
				rune_img: RUNE_MAP[w.key].img,
				time: w.time,
				hero_img,
				isRadiant
			})
		})
	})
	match.teamfights.forEach(v => {
		let total_damage = 0
		,	total_gold = 0
		,	total_xp = 0
		,	players

		players = v.players.map((w, index) => {
			w.hero_img = player_imgs[index].hero_img
			w.hero_icon = player_imgs[index].hero_icon
			return w
		})

		players = players.map(v => {
			v.class = {
				death: !!v.deaths
			}
			v.abilitys = Object.keys(v.ability_uses).map(key => {
				return {
					name: key,
					times: v.ability_uses[key],
					img: API.IMG_HOST + '/apps/dota2/images/abilities/' + key + '_sm.png'
				}
			})
			v.items = Object.keys(v.item_uses).map(key => {
				return {
					name: key,
					times: v.item_uses[key],
					img: API.IMG_HOST + ITEMS[key].img
				}
			})
			total_damage += v.damage
			total_xp += v.xp_delta
			total_gold += Math.abs(v.gold_delta)
			return v
		})

		players = players.map(v => {
			v.damage_percent = percentify(v.damage / total_damage)
			v.xp_percent = percentify(v.xp_delta / total_xp)
			v.gold_percent = percentify(Math.abs(v.gold_delta / total_gold))
			v.positions = parsePositions(v.deaths_pos)
			return v
		})

		logs.push({
			type: 'teamfight',
			start: DateLib.duration(v.start),
			end: DateLib.duration(v.end),
			time: v.start,
			radiant_players: players.slice(0, 5),
			dire_players: players.slice(5),
			players: players,
			map_img: API.MAP
		})
	})
	logs = logs
	.sort((p, n) => p.time < n.time ? -1 : p.time > n.time ? 1 : 0)
	.map(v => {
		v.time = v.time > 0 ? DateLib.duration(v.time) : '-' + DateLib.duration(Math.abs(v.time))
		return v
	})
	return logs
}
