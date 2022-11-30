Bugs
- Ignore null foreign keys for ownership when some foreign keys are null and some are not. Right now having one null foreign key lets anyone view the record, regardless of the other foreign keys

Docs
- recreating schema cache after manual schema changes
- add code comments + docs explaining red, green and grey connected (ownership) paths. Include truth tables for mutate and query behaviour

Validations
- Foreign keys not referencing an actual record
- identifying key not existing in database

New features (includes tests and docs)
- Allow independent control of nesting $where clause and nester function, maybe add $nest syntax or equivalent. (e.g. you may want a custom where clause but still have nesting in the json)
- add $exists and $not $exists to validation
- recursive queries. Ideas for syntax:

  {
    $with_recursive: ['ancestor_categories', {
      $union_distinct: [{
        $select: ['id', 'parent_id'],
        $from: 'categories',
        $where: ...
      }, {
        $select: ['id', 'parent_id'],
        $from: 'categories',
        $where: {
          $eq: ['id', 'parent_id']
        }
      }]
    }]
    $select: ['id'],
    $from: 'ancestor_categories'
  }

  {
    $select: ['id', 'parent_id'],
    $from: 'categories',
    $recurse: {
      $eq: ['parent_id', {
        $entity: '$recurse',
        $field: 'id'
      }]
    }
  }