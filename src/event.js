class Event{
    /**
     * Event object for new events and retrieving events
     * @constructor
     * @param {number} sequenceNumber - events are store in a sequence, only used for retrieval of events
     * @param {string} type - used to identify the event type
     * @param {date} occurredAt - the time the event was recorded, only used for retrieval, timestamp is when the event was recorded
     * @param {object} content - the payload of the event, can be any serializable object
     * @param {object} metadata - the meta data payload, can be any serializable object
     **/
    constructor(sequenceNumber, type, occurredAt, content, metadata) {
        this.sequenceNumber = sequenceNumber;
        this.type = type;
        this.occurredAt = occurredAt;
        this.content = content;
        if (metadata instanceof Object) {
            this.metadata = metadata;
        }else{
            console.error(`Metadata not found on or not an object: ${type}`);
            this.metadata = { "version" : "0.0.0" };
        }
    }
}

module.exports = Event;
