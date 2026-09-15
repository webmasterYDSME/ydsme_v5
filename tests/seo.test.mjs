import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldNoIndex } from '../lib/search-indexing.ts';
import { eventStructuredData, searchDescription } from '../lib/event-seo.ts';
import { publicPageMetadata, safeJsonLd, SITE_URL } from '../lib/seo.ts';

test('SEO uses the live canonical domain without a redirect', () => {
  assert.equal(SITE_URL, 'https://yorkmodelengineers.co.uk');
});

const event = { id: 7, name: 'Public railway day', descriptions: 'Join us.\n\nEnjoy the railway.', start_date: '2027-07-10', end_date: '2027-07-11', start_time: '10:00:00', end_time: '16:00:00', booking_enabled: true, is_ticket_required: true, available_places: 8 };

test('only operational routes and preview deployments are excluded from indexing', () => {
  for (const path of ['/signin', '/admin/events', '/dashboard/workbench/1', '/auth/callback', '/membership/guardian-consent', '/membership/apply', '/events/7/book', '/api/events/polish']) assert.equal(shouldNoIndex(path, 'production'), true, path);
  for (const path of ['/', '/events', '/events/7', '/membership', '/projects/train', '/visitors']) {
    assert.equal(shouldNoIndex(path, 'production'), false, path);
    assert.equal(shouldNoIndex(path, 'preview'), true, path);
  }
  assert.equal(shouldNoIndex('/membership/application-story'), false);
});

test('event schema uses the public detail URL, local times and accurate free-booking availability', () => {
  const schema = eventStructuredData(event, 'https://example.com', '/event.png');
  assert.equal(schema.url, 'https://example.com/events/7');
  assert.equal(schema.startDate, '2027-07-10T10:00:00');
  assert.equal(schema.endDate, '2027-07-11T16:00:00');
  assert.equal(schema.image, 'https://example.com/event.png');
  assert.equal(schema.offers.price, 0);
  assert.equal(schema.offers.url, 'https://example.com/events/7/book');
  assert.equal(schema.offers.availability, 'https://schema.org/InStock');
  assert.equal(eventStructuredData({ ...event, available_places: 0 }, 'https://example.com', '/event.png').offers.availability, 'https://schema.org/SoldOut');
  const ticketed = eventStructuredData({ ...event, booking_enabled: false }, 'https://example.com', '/event.png');
  assert.equal(ticketed.offers, undefined);
  assert.equal(ticketed.isAccessibleForFree, false);
});

test('event snippets collapse whitespace and social metadata uses event artwork', () => {
  assert.equal(searchDescription('Join us.\n\n  Enjoy the railway.'), 'Join us. Enjoy the railway.');
  assert.ok(searchDescription('A long description '.repeat(20)).length <= 160);
  const meta = publicPageMetadata({ title: event.name, description: 'A day at the railway.', path: '/events/7', image: { url: '/event.png', alt: event.name } });
  assert.equal(meta.alternates.canonical, '/events/7');
  assert.deepEqual(meta.openGraph.images, [{ url: '/event.png', alt: event.name }]);
  assert.deepEqual(meta.twitter.images, ['/event.png']);
  assert.ok(!safeJsonLd({ name: '</script><script>alert(1)</script>' }).includes('<'));
});
