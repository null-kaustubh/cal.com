import prisma from "@calcom/prisma";
import { expect } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { test } from "./lib/fixtures";
import { bookTimeSlot, createUserWithSeatedEventAndAttendees } from "./lib/testUtils";

test.describe.configure({ mode: "parallel" });
test.afterEach(({ users }) => users.deleteAll());

test.describe("onlyShowFirstAvailableSlot with seated events", () => {
  test("Should show and allow booking next available slot when first slot reaches seat capacity", async ({
    page,
    users,
    bookings,
  }) => {
    const { user, booking } = await createUserWithSeatedEventAndAttendees({ users, bookings }, [
      { name: "Attendee One", email: "attendee1@seats.com", timeZone: "Europe/Berlin" },
      { name: "Attendee Two", email: "attendee2@seats.com", timeZone: "Europe/Berlin" },
    ]);

    const bookingWithEventType = await prisma.booking.findFirst({
      where: { uid: booking.uid },
      select: { id: true, eventTypeId: true },
    });

    await prisma.eventType.update({
      data: {
        seatsPerTimeSlot: 2,
        onlyShowFirstAvailableSlot: true,
      },
      where: { id: bookingWithEventType?.eventTypeId ?? -1 },
    });

    const bookingAttendees = await prisma.attendee.findMany({
      where: { bookingId: booking.id },
      select: { id: true, name: true, email: true },
    });

    await prisma.bookingSeat.createMany({
      data: bookingAttendees.map((attendee) => ({
        bookingId: booking.id,
        attendeeId: attendee.id,
        referenceUid: uuidv4(),
        data: { responses: { name: attendee.name, email: attendee.email } },
      })),
    });

    await page.goto(`/${user.username}/seats`);

    const incrementMonth = page.getByTestId("incrementMonth");
    await incrementMonth.waitFor();
    await incrementMonth.click();

    const firstAvailableDay = page.locator('[data-testid="day"][data-disabled="false"]').nth(0);
    await firstAvailableDay.waitFor();
    await firstAvailableDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBeGreaterThan(0);

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:30");

    await timeSlots.first().click();
    await bookTimeSlot(page, { name: "New Attendee", email: "new@seats.com" });

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  test("Should show slot when seats are partially booked", async ({ page, users, bookings }) => {
    const { user, booking } = await createUserWithSeatedEventAndAttendees({ users, bookings }, [
      { name: "Attendee One", email: "attendee1@seats.com", timeZone: "Europe/Berlin" },
    ]);

    const bookingWithEventType = await prisma.booking.findFirst({
      where: { uid: booking.uid },
      select: { id: true, eventTypeId: true },
    });

    await prisma.eventType.update({
      data: {
        seatsPerTimeSlot: 3,
        onlyShowFirstAvailableSlot: true,
      },
      where: { id: bookingWithEventType?.eventTypeId ?? -1 },
    });

    const bookingAttendees = await prisma.attendee.findMany({
      where: { bookingId: booking.id },
      select: { id: true, name: true, email: true },
    });

    await prisma.bookingSeat.createMany({
      data: bookingAttendees.map((attendee) => ({
        bookingId: booking.id,
        attendeeId: attendee.id,
        referenceUid: uuidv4(),
        data: { responses: { name: attendee.name, email: attendee.email } },
      })),
    });

    await page.goto(`/${user.username}/seats`);

    const incrementMonth = page.getByTestId("incrementMonth");
    await incrementMonth.waitFor();
    await incrementMonth.click();

    const firstAvailableDay = page.locator('[data-testid="day"][data-disabled="false"]').nth(0);
    await firstAvailableDay.waitFor();
    await firstAvailableDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Seats available").first()).toBeVisible();

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:00");
  });

  test("Should show only one slot per day when enabled", async ({ page, users, bookings }) => {
    const { user, booking } = await createUserWithSeatedEventAndAttendees({ users, bookings }, []);

    const bookingWithEventType = await prisma.booking.findFirst({
      where: { uid: booking.uid },
      select: { id: true, eventTypeId: true },
    });

    await prisma.eventType.update({
      data: {
        onlyShowFirstAvailableSlot: true,
      },
      where: { id: bookingWithEventType?.eventTypeId ?? -1 },
    });

    await page.goto(`/${user.username}/seats`);

    const incrementMonth = page.getByTestId("incrementMonth");
    await incrementMonth.waitFor();
    await incrementMonth.click();

    const firstAvailableDay = page.locator('[data-testid="day"][data-disabled="false"]').nth(0);
    await firstAvailableDay.waitFor();
    await firstAvailableDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:00");
  });
});

test.describe("onlyShowFirstAvailableSlot with regular events", () => {
  test("Should show only one slot per day when enabled", async ({ page, users }) => {
    const user = await users.create();
    const eventType = user.eventTypes.find((e) => e.slug === "30-min")!;

    await prisma.eventType.update({
      data: { onlyShowFirstAvailableSlot: true },
      where: { id: eventType.id },
    });

    await page.goto(`/${user.username}/30-min`);

    const incrementMonth = page.getByTestId("incrementMonth");
    await incrementMonth.waitFor();
    await incrementMonth.click();

    const firstAvailableDay = page.locator('[data-testid="day"][data-disabled="false"]').nth(0);
    await firstAvailableDay.waitFor();
    await firstAvailableDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:00");
  });

  test("Should show next available slot when first slot is booked", async ({ page, users, bookings }) => {
    const user = await users.create();
    const eventType = user.eventTypes.find((e) => e.slug === "30-min")!;

    await prisma.eventType.update({
      data: { onlyShowFirstAvailableSlot: true },
      where: { id: eventType.id },
    });

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    while (nextMonth.getDay() === 0 || nextMonth.getDay() === 6) {
      nextMonth.setDate(nextMonth.getDate() + 1);
    }

    const firstSlotStart = new Date(nextMonth);
    firstSlotStart.setHours(9, 0, 0, 0);
    const firstSlotEnd = new Date(firstSlotStart);
    firstSlotEnd.setMinutes(firstSlotEnd.getMinutes() + 30);

    await bookings.create(user.id, user.username, eventType.id, {
      status: "ACCEPTED",
      startTime: firstSlotStart,
      endTime: firstSlotEnd,
    });

    await page.goto(`/${user.username}/30-min`);

    const incrementMonth = page.getByTestId("incrementMonth");
    await incrementMonth.waitFor();
    await incrementMonth.click();

    const firstAvailableDay = page.locator('[data-testid="day"][data-disabled="false"]').nth(0);
    await firstAvailableDay.waitFor();
    await firstAvailableDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });
    expect(await timeSlots.count()).toBe(1);

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:30");
  });

  test("Should allow booking the shown slot", async ({ page, users }) => {
    const user = await users.create();
    const eventType = user.eventTypes.find((e) => e.slug === "30-min")!;

    await prisma.eventType.update({
      data: { onlyShowFirstAvailableSlot: true },
      where: { id: eventType.id },
    });

    await page.goto(`/${user.username}/30-min`);

    const incrementMonth = page.getByTestId("incrementMonth");
    await incrementMonth.waitFor();
    await incrementMonth.click();

    const firstAvailableDay = page.locator('[data-testid="day"][data-disabled="false"]').nth(0);
    await firstAvailableDay.waitFor();
    await firstAvailableDay.click();

    const timeSlots = page.locator('[data-testid="time"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10000 });

    const slotTime = await timeSlots.first().getAttribute("data-time");
    expect(slotTime).toContain("9:00");

    await timeSlots.first().click();
    await bookTimeSlot(page, { name: "Test User", email: "test@example.com" });

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });
});
