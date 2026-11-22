'use strict';

// Get Followed Streams: documented shape, not recorded.
// https://dev.twitch.tv/docs/api/reference/streams#get-followed-streams
// The first page is abbreviated; viewer counts can change between requests.
const pageOne = {
  data: [{
    id: '50001',
    user_id: '2001',
    user_login: 'quiet_station',
    user_name: 'Quiet Station',
    game_id: '509658',
    game_name: 'Just Chatting',
    type: 'live',
    title: 'Late night radio',
    viewer_count: 9,
    started_at: '2026-11-22T03:00:00Z',
    language: 'en',
    thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_quiet_station-{width}x{height}.jpg',
    tag_ids: [],
    tags: ['Radio'],
    is_mature: false
  }],
  pagination: {cursor: 'fixture-page+2/='}
};

const pageTwo = {
  data: [{
    id: '50002',
    user_id: '2002',
    user_login: 'pixel_harbor',
    user_name: 'Pixel Harbor',
    game_id: '27471',
    game_name: 'Minecraft',
    type: 'live',
    title: 'Building the docks',
    viewer_count: 103,
    started_at: '2026-11-22T04:00:00Z',
    language: 'en',
    thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_pixel_harbor-{width}x{height}.jpg',
    tag_ids: [],
    tags: null,
    is_mature: false
  }],
  pagination: {}
};

module.exports = {pageOne, pageTwo, empty: {data: [], pagination: {}}};
