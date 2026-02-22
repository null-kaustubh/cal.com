import dayjs from "@calcom/dayjs";
import prisma from "@calcom/prisma";
import type { Schedule, TimeRange } from "@calcom/types/schedule";
import { expect } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { TimeZoneEnum } from "./fixtures/types";
import { test } from "./lib/fixtures";
import { bookTimeSlot } from "./lib/testUtils";

test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ users }) => users.deleteAll());

// 9 AM - 5 PM every day (including weekends) to ensure tomorrow is always available
const defaultDateRange: TimeRange = {
  start: new Date(new Date().setUTCHours(9, 0, 0, 0)),
  end: new Date(new Date().setUTCHours(17, 0, 0, 0)),
};
const allDaysAvailable: Schedule = Array(7).fill([defaultDateRange]);

test.describe("onlyShowFirstAvailableSlot with regular events", () => {
  test("Should show only one slot per day and allow booking it", async ({ page, users }) => {
    const user = await users.create({
      schedule: allDaysAvailable,
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "30 min",
          slug: "30-min",
          length: 30,
          onlyShowFirstAvailableSlot: true,
        },
      ],
    });

    await page.goto(`/${user.username}/30-min`);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.getDate();

    const tomorrowDay = page
      .locator(`[data-testid="day"][data-disabled="false"]`)
      .getByText(String(tomorrowDate), { exact: true });
    await tomorrowDay.waitFor();
    await tomorrowDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:00");

    // Book the slot and verify success
    await timeSlots.first().click();
    await bookTimeSlot(page, { name: "Test User", email: "test@example.com" });
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  test("Should account for beforeEventBuffer when showing first available slot", async ({
    page,
    users,
    bookings,
  }) => {
    const user = await users.create({
      schedule: allDaysAvailable,
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "Buffered event",
          slug: "buffered",
          length: 30,
          beforeEventBuffer: 30,
          onlyShowFirstAvailableSlot: true,
        },
      ],
    });
    const eventType = user.eventTypes.find((e) => e.slug === "buffered")!;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const firstSlotEnd = new Date(tomorrow);
    firstSlotEnd.setMinutes(firstSlotEnd.getMinutes() + 30);

    // Book 9:00-9:30 slot
    await bookings.create(user.id, user.username, eventType.id, {
      status: "ACCEPTED",
      startTime: tomorrow,
      endTime: firstSlotEnd,
    });

    await page.goto(`/${user.username}/buffered`);

    const tomorrowDate = tomorrow.getDate();
    const tomorrowDay = page
      .locator(`[data-testid="day"][data-disabled="false"]`)
      .getByText(String(tomorrowDate), { exact: true });
    await tomorrowDay.waitFor();
    await tomorrowDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    // 9:00-9:30 booked. Next slot 9:30 needs 30min buffer (9:00-9:30) which conflicts.
    // So next available is 10:00 (buffer 9:30-10:00 has no conflict)
    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("10:00");
  });

  test("Should account for afterEventBuffer when showing first available slot", async ({
    page,
    users,
    bookings,
  }) => {
    const user = await users.create({
      schedule: allDaysAvailable,
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "Buffered event",
          slug: "buffered",
          length: 30,
          afterEventBuffer: 15,
          onlyShowFirstAvailableSlot: true,
        },
      ],
    });
    const eventType = user.eventTypes.find((e) => e.slug === "buffered")!;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const firstSlotEnd = new Date(tomorrow);
    firstSlotEnd.setMinutes(firstSlotEnd.getMinutes() + 30);

    // Book 9:00 slot - with 15min afterEventBuffer, next available should be 9:45
    await bookings.create(user.id, user.username, eventType.id, {
      status: "ACCEPTED",
      startTime: tomorrow,
      endTime: firstSlotEnd,
    });

    await page.goto(`/${user.username}/buffered`);

    const tomorrowDate = tomorrow.getDate();
    const tomorrowDay = page
      .locator(`[data-testid="day"][data-disabled="false"]`)
      .getByText(String(tomorrowDate), { exact: true });
    await tomorrowDay.waitFor();
    await tomorrowDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    // 9:00 booked + 30min event + 15min buffer = 9:45, but slots are at 30-min intervals
    // so next available slot is 10:00
    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("10:00");
  });

  test("Should show next available slot when first slot is booked", async ({ page, users, bookings }) => {
    const user = await users.create({
      schedule: allDaysAvailable,
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "30 min",
          slug: "30-min",
          length: 30,
          onlyShowFirstAvailableSlot: true,
        },
      ],
    });
    const eventType = user.eventTypes.find((e) => e.slug === "30-min")!;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const firstSlotEnd = new Date(tomorrow);
    firstSlotEnd.setMinutes(firstSlotEnd.getMinutes() + 30);

    await bookings.create(user.id, user.username, eventType.id, {
      status: "ACCEPTED",
      startTime: tomorrow,
      endTime: firstSlotEnd,
    });

    await page.goto(`/${user.username}/30-min`);

    const tomorrowDate = tomorrow.getDate();
    const tomorrowDay = page
      .locator(`[data-testid="day"][data-disabled="false"]`)
      .getByText(String(tomorrowDate), { exact: true });
    await tomorrowDay.waitFor();
    await tomorrowDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:30");
  });

});

test.describe("onlyShowFirstAvailableSlot with seated events", () => {
  test("Should show and allow booking next available slot when first slot reaches seat capacity", async ({
    page,
    users,
    bookings,
  }) => {
    const user = await users.create({
      schedule: allDaysAvailable,
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "Seated event",
          slug: "seats",
          length: 30,
          seatsPerTimeSlot: 2,
          onlyShowFirstAvailableSlot: true,
          disableGuests: true,
        },
      ],
    });
    const eventType = user.eventTypes.find((e) => e.slug === "seats")!;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const firstSlotEnd = new Date(tomorrow);
    firstSlotEnd.setMinutes(firstSlotEnd.getMinutes() + 30);

    const seatedBooking = await bookings.create(user.id, user.username, eventType.id, {
      status: "ACCEPTED",
      startTime: tomorrow,
      endTime: firstSlotEnd,
      attendees: {
        createMany: {
          data: [
            { name: "Attendee One", email: "attendee1@seats.com", timeZone: "Europe/Berlin" },
            { name: "Attendee Two", email: "attendee2@seats.com", timeZone: "Europe/Berlin" },
          ],
        },
      },
    });

    const bookingAttendees = await prisma.attendee.findMany({
      where: { bookingId: seatedBooking.id },
      select: { id: true, name: true, email: true },
    });

    await prisma.bookingSeat.createMany({
      data: bookingAttendees.map((attendee) => ({
        bookingId: seatedBooking.id,
        attendeeId: attendee.id,
        referenceUid: uuidv4(),
        data: { responses: { name: attendee.name, email: attendee.email } },
      })),
    });

    await page.goto(`/${user.username}/seats`);

    const tomorrowDate = tomorrow.getDate();
    const tomorrowDay = page
      .locator(`[data-testid="day"][data-disabled="false"]`)
      .getByText(String(tomorrowDate), { exact: true });
    await tomorrowDay.waitFor();
    await tomorrowDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:30");

    await timeSlots.first().click();
    await bookTimeSlot(page, { name: "New Attendee", email: "new@seats.com" });

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  test("Should show slot when seats are partially booked", async ({ page, users, bookings }) => {
    const user = await users.create({
      schedule: allDaysAvailable,
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "Seated event",
          slug: "seats",
          length: 30,
          seatsPerTimeSlot: 3,
          onlyShowFirstAvailableSlot: true,
          disableGuests: true,
        },
      ],
    });
    const eventType = user.eventTypes.find((e) => e.slug === "seats")!;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const firstSlotEnd = new Date(tomorrow);
    firstSlotEnd.setMinutes(firstSlotEnd.getMinutes() + 30);

    const seatedBooking = await bookings.create(user.id, user.username, eventType.id, {
      status: "ACCEPTED",
      startTime: tomorrow,
      endTime: firstSlotEnd,
      attendees: {
        createMany: {
          data: [{ name: "Attendee One", email: "attendee1@seats.com", timeZone: "Europe/Berlin" }],
        },
      },
    });

    const bookingAttendees = await prisma.attendee.findMany({
      where: { bookingId: seatedBooking.id },
      select: { id: true, name: true, email: true },
    });

    await prisma.bookingSeat.createMany({
      data: bookingAttendees.map((attendee) => ({
        bookingId: seatedBooking.id,
        attendeeId: attendee.id,
        referenceUid: uuidv4(),
        data: { responses: { name: attendee.name, email: attendee.email } },
      })),
    });

    await page.goto(`/${user.username}/seats`);

    const tomorrowDate = tomorrow.getDate();
    const tomorrowDay = page
      .locator(`[data-testid="day"][data-disabled="false"]`)
      .getByText(String(tomorrowDate), { exact: true });
    await tomorrowDay.waitFor();
    await tomorrowDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Seats available").first()).toBeVisible();

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:00");
  });
});

test.describe("onlyShowFirstAvailableSlot with different timezones", () => {
  test("Should show correct first slot time when booker changes timezone", async ({ page, users }) => {
    const user = await users.create({
      timeZone: TimeZoneEnum.UK,
      schedule: allDaysAvailable,
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "30 min",
          slug: "30-min",
          length: 30,
          onlyShowFirstAvailableSlot: true,
        },
      ],
    });

    await page.goto(`/${user.username}/30-min`);

    const tomorrow = dayjs().add(1, "day");
    const tomorrowDate = tomorrow.date();

    const tomorrowDay = page
      .locator(`[data-testid="day"][data-disabled="false"]`)
      .getByText(String(tomorrowDate), { exact: true });
    await tomorrowDay.waitFor();
    await tomorrowDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    // Schedule is 9:00 UTC. Calculate expected time in London timezone.
    const slotInUTC = tomorrow.utc().hour(9).minute(0);
    const expectedLondonTime = slotInUTC.tz("Europe/London").format("h:mma").toLowerCase();

    const displayedTimeLondon = await timeSlots.first().textContent();
    expect(displayedTimeLondon?.toLowerCase()).toContain(expectedLondonTime);

    // Change timezone to America/New_York
    const timezoneSelector = page.locator('[data-testid="event-meta-current-timezone"]');
    await timezoneSelector.click();
    await page.locator('[aria-label="Timezone Select"]').fill("New York");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("timezone-select").getByText("America/New York")).toBeVisible({ timeout: 10000 });

    // Wait for slots to update and verify still only one slot
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    // Verify displayed time matches expected New York time
    const expectedNYTime = slotInUTC.tz("America/New_York").format("h:mma").toLowerCase();
    const displayedTimeNY = await timeSlots.first().textContent();
    expect(displayedTimeNY?.toLowerCase()).toContain(expectedNYTime);
  });
});
