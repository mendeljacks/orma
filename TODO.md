Query
  [-] 'simple' json to sql parser
    [x] add commands
    [ ] add mysql functions
    [ ] check mysql docs for missed commands
  [x] query planner
  [x] query to sql json converter (handles creating $selects, $from based on key name etc.)
  [x] nester
  [-] wrapper function



Query validation

Query types

Mutation

Mutation validation

Mutation types

- Add better error messages when foreign keys dont exist between two entities in a query

- Allow independent control of nesting $where clause and nester function, maybe add $nest syntax or equivalent. (e.g. you may want a custom where clause but still have nesting in the json)
- Ignore null foreign keys for ownership when some foreign keys are null and some are not. Right now having one null foreign key lets anyone view the record, regardless of the other foreign keys