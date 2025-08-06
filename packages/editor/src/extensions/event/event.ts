import { Extension } from '@tiptap/core';
import { EventEmitter as Em } from './event-emitter';

const event = new Em();

/**
 * 添加事件能力
 */
export const EventEmitter = Extension.create({
    name: 'eventEmitter',
    priority: 200,
    addOptions() {
        return { eventEmitter: event };
    },
    addStorage() {
        return this.options;
    },
});
