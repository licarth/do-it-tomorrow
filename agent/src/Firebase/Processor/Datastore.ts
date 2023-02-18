import { JobDefinition } from "@timetriggers/domain";
import { Observable } from "rxjs";
import * as TE from "fp-ts/lib/TaskEither.js";
import { HttpCallLastStatus } from "@/HttpCallStatusUpdate";
import { JobScheduleArgs } from "@timetriggers/domain";
import { JobId } from "@timetriggers/domain";
import { Shard } from "@timetriggers/domain";
import { ShardsToListenTo } from "./ShardsToListenTo";

export type ShardingAlgorithm = (job: JobId) => Shard[];
// For firestore, we'll just pretend that we have more nodes than we actually have.
// Each processor will take more than one shard.

export type GetJobsScheduledBeforeArgs = {
  offset?: number;
  millisecondsFromNow: number;
  limit: number;
};

export interface Datastore {
  schedule(
    args: JobScheduleArgs,
    shardingAlgorithm?: ShardingAlgorithm
  ): TE.TaskEither<Error, JobId>;
  cancel(jobId: JobId): TE.TaskEither<Error, void>;

  /**
   * This is a stream of registered jobs.
   *
   * This returns new jobs that are being registered while we are listening.
   *
   * The first invocation **may** return some old jobs that we haven't seen yet (like when we restart the processor).
   * Be careful when calling this, as it may return a lot of jobs (e.g. with Firestore).
   *
   * Processors call countJobsBefore(millisecondsFromNow) prior to this to make sure this request doesn't return too many jobs.
   *
   * It's ok to emit the same job multiple times occasionally,
   * as long as performance is not affected too much,
   * this is because the transaction will make sure to not add the same job twice to the queue.
   *
   * This can be implemented as a poll (e.g. MySQL) or as a blocking get if supported (e.g. Firestore).
   *
   * __NOTE: TODO:__ This could be improved by getting this directly from the Api.
   * This would allow us to avoid polling the datastore, even if it's PostgreSQL.
   *
   * But then this means we'd need to give this to the right Shard. This could be an internal endpoint of
   * our Api. (Api => Scheduler directly).
   *
   * The first call must return all jobs that are scheduled within the next millisecondsFromNow.
   *
   * This is an optional method, and is only used if the datastore supports watching for added / modified jobs.
   *
   * Whenever it emits a new value (even an empty JobDefinition[]), it tells the scheduler to immediately check for new jobs
   * to schedule.
   *
   * If you don't want to implement this, you can just return TE.left("not implemented").
   *
   */
  listenToNewlyRegisteredJobs(
    args?: {},
    shardsToListenTo?: ShardsToListenTo
  ): TE.TaskEither<
    "too many previous jobs" | "not implemented",
    Observable<JobDefinition[]>
  >;

  /**
   * Returns all jobs scheduled after msFromNow, up to limit items.
   * They must be ordered by scheduledAt.
   *
   */
  getJobsScheduledBefore(
    args: GetJobsScheduledBeforeArgs,
    shardsToListenTo?: ShardsToListenTo
  ): TE.TaskEither<any, JobDefinition[]>;

  // Some datastores support watching for added / modified jobs. For these, we can avoid high-frequency polling.
  // => 1. listen to jobs newly (re-)scheduled within a given time range from now (and in the past).
  // => 2. and poll for jobs beyond that time range.

  // If the datastore does not support watching for added / modified jobs, we can use the following methods:
  // => 1. poll for jobs that are scheduled within a given time range from now (and in the past). (e.g. MySQL - poll every second)
  // => 2. and poll for jobs beyond that time range.

  // For the poll version of 1., we should keep in memory the list of jobs already discovered,
  // and only warn again except if nothing has happened for 5 minutes and the job is still registered.

  /**
   * Waits for the next job in the queue.
   *
   * If the datastore does not support blocking gets, this can be implemented as a poll.
   *
   * returns the next job(s) in the queue, up to limit.
   *
   */
  waitForNextJobsInQueue(
    args: {
      limit: number;
    },
    shardsToListenTo?: ShardsToListenTo
  ): TE.TaskEither<Error, Observable<JobDefinition[]>>;

  /**
   * Moves this job to the queue so that it's immediately picked up by the processor(s).
   * This must fail on the second call with the same jobDefinition.
   */
  queueJobs(jobDefinition: JobDefinition[]): TE.TaskEither<any, void>;

  /**
   * Marks the job as running.
   * This must fail if the job (any of):
   *   - is not in the queue.
   *   - is already running.
   *   - is already complete.
   */
  markJobAsRunning(jobDefinition: JobDefinition): TE.TaskEither<any, void>;

  /**
   * Marks the job as complete.
   */
  markJobAsComplete(args: {
    jobDefinition: JobDefinition;
    lastStatusUpdate: HttpCallLastStatus;
    durationMs: number;
    executionStartDate: Date;
  }): TE.TaskEither<any, void>;

  close(): TE.TaskEither<any, void>;
}
