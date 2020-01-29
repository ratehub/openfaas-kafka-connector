class Subscription{

    constructor(stream, name, functions, concurrency, processor){
        this.stream = stream;
        this.name = name;
        this.processor = processor;
        this.functions = functions;
        this.concurrency = concurrency;
    }
}

module.exports = Subscription;
