'use strict';

// Get Videos: documented shape, not recorded.
// https://dev.twitch.tv/docs/api/reference/videos#get-videos
const archives = {
  data: [{
    id: '2700000123',
    stream_id: '49001',
    user_id: '2002',
    user_login: 'pixel_harbor',
    user_name: 'Pixel Harbor',
    title: 'Lighthouse build',
    description: '',
    created_at: '2026-11-21T19:00:00Z',
    published_at: '2026-11-21T19:01:00Z',
    url: 'https://www.twitch.tv/videos/2700000123?t=2m',
    thumbnail_url: 'https://static-cdn.jtvnw.net/cf_vods/fixture-lighthouse/thumb-%{width}x%{height}.jpg',
    viewable: 'public',
    view_count: 112,
    language: 'en',
    type: 'archive',
    duration: '1h5m3s',
    muted_segments: null
  }, {
    id: '2700000088',
    stream_id: '49000',
    user_id: '2002',
    user_login: 'pixel_harbor',
    user_name: 'Pixel Harbor',
    title: 'Sketching the harbor',
    description: '',
    created_at: '2026-11-20T19:00:00Z',
    published_at: '2026-11-20T19:01:00Z',
    url: 'https://www.twitch.tv/videos/2700000088',
    thumbnail_url: 'https://static-cdn.jtvnw.net/cf_vods/fixture-harbor/thumb-%{width}x%{height}.jpg',
    viewable: 'public',
    view_count: 221,
    language: 'en',
    type: 'archive',
    duration: '47m9s',
    muted_segments: [{duration: 30, offset: 600}]
  }],
  pagination: {}
};

module.exports = {archives, empty: {data: [], pagination: {}}};
