import prisma from "@calcom/prisma";
import { expect } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { test } from "./lib/fixtures";
import {
  bookTimeSlot,
  createUserWithSeatedEventAndAttendees,
  selectFirstAvailableTimeSlotNextMonth,
} from "./lib/testUtils";

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
  });
});
