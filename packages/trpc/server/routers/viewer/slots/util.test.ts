import { BookingDateInPastError, isTimeOutOfBounds } from "@calcom/lib/isOutOfBounds";
import { TRPCError } from "@trpc/server";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { mapSlotsToDateInternal } from "./util";

describe("BookingDateInPastError handling", () => {
  it("should convert BookingDateInPastError to TRPCError with BAD_REQUEST code", () => {
    const testFilteringLogic = () => {
      const mockSlot = {
        time: "2024-05-20T12:30:00.000Z", // Past date
        attendees: 1,
      };

      const mockEventType = {
        minimumBookingNotice: 0,
      };

      const isFutureLimitViolationForTheSlot = false; // Mock this to false

      let isOutOfBounds = false;
      try {
        // This will throw BookingDateInPastError for past dates
        isOutOfBounds = isTimeOutOfBounds({
          time: mockSlot.time,
          minimumBookingNotice: mockEventType.minimumBookingNotice,
        });
      } catch (error) {
        if (error instanceof BookingDateInPastError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw error;
      }

      return !isFutureLimitViolationForTheSlot && !isOutOfBounds;
    };

    // This should throw a TRPCError with BAD_REQUEST code
    expect(() => testFilteringLogic()).toThrow(TRPCError);
    expect(() => testFilteringLogic()).toThrow("Attempting to book a meeting in the past.");
  });
});

describe("mapSlotsToDateInternal", () => {
  it("skips fully booked slot before applying first-slot-only rule", () => {
    const base = dayjs().add(7, "day").startOf("day");

    const slot1 = base.add(9, "hour");
    const slot2 = base.add(10, "hour");

    const formatter = new Intl.DateTimeFormat("fr-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    });

    const result = mapSlotsToDateInternal({
      availableTimeSlots: [{ time: slot1 }, { time: slot2 }],
      currentSeats: [
        {
          startTime: slot1.toDate(),
          _count: { attendees: 2 },
        },
      ],
      eventType: {
        seatsPerTimeSlot: 2,
        onlyShowFirstAvailableSlot: true,
      },
      formatter,
    });

    const dateKey = Object.keys(result)[0];
    const slots = result[dateKey];

    expect(slots).toHaveLength(1);
    expect(slots[0].time).toBe(slot2.toISOString());
  });
});
