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

- $guid on query

{
  items: {
    $guid_map: {
      id: 'asd'
    },
    id: true
  },
  images: {
    id: true,
    $where: {
      $in: ['item_id', { $guid: 'asd' }]
    }
  }
}

  + keeps select part of query identical, no special handling for guid
  - fields in guid map can go out of sync
  - need separate keyword since the structure of the guid is different
  - different from mutations


{
  items: {
    my_id: { $guid: 'asd', $value: 'id' }
  },
  images: {
    id: true,
    $where: {
      $in: ['item_id', { $guid: 'asd' }]
    }
  }
}

 - need special handling in types etc for $value

{
  $select: ['id'],
  $from: 'items'
}