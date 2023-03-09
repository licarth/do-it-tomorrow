import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither.js";
import * as C from "io-ts/lib/Codec.js";
import { anyOpaqueCodec, Clock, CodecType, e, UtcDate } from "../";
import { evaluate } from "./ScheduledAt/DateFunctions";

export namespace ScheduledAt {
  export const codec = (codecType: CodecType) =>
    codecType === "firestore"
      ? anyOpaqueCodec(UtcDate.firestoreDateCodec, "ScheduledAt")
      : anyOpaqueCodec(UtcDate.stringCodec, "ScheduledAt");

  export const fromUTCString = (date: string): ScheduledAt => {
    return e.unsafeGetOrThrow(codec("string").decode(date));
  };

  export const fromQueryLanguage =
    (queryLangString: string) =>
    ({ clock }: { clock: Clock }) =>
      pipe(
        TE.tryCatch(async () => {
          return evaluate(queryLangString)({ clock });
        }, E.toError),
        TE.map((d) => {
          return d as ScheduledAt;
        })
      );

  export const fromDate = (date: Date): ScheduledAt => {
    return e.unsafeGetOrThrow(codec("string").decode(date.toISOString()));
  };
  export const factory = (date?: Date): ScheduledAt => {
    return date ? fromDate(date) : fromDate(new Date());
  };

  export const parseISOString = (
    date: unknown
  ): E.Either<"Invalid Date", ScheduledAt> => {
    if (typeof date !== "string") {
      return E.left("Invalid Date");
    }
    const d = new Date(date);
    return isNaN(d.getTime()) ? E.left("Invalid Date") : E.right(fromDate(d));
  };
}
export type ScheduledAt = C.TypeOf<ReturnType<typeof ScheduledAt.codec>>;
