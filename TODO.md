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

- refactor
- new syntax
- query
- asd



- asd
- asd
  - asd
  - asd


1.
current:
- most concise (least indentation and lines of code)
- $ are annoying to type and double-click to select doesnt select them
- probably source of slow types
- $ are ugly and makes things seem complicated
- medium difficulty to get list of selected things ( Object.keys(items).filter(el => el[0] !== '$') )
- cant select renamed things with a $ without having a separate $select syntax (e.g. having $operation: 'create' on each returned row)

{
    $where_connected: [],
    items: {
        id: true,
        my_sku: 'sku',
        _mutable: {
            $escape: false
        }
        lowercase_sku: {
            $lower: 'sku'
        }
        my_variants: {
            $from: 'variants',
            asin: true,
            products: {
                vendors: {
                    name: true
                }
            }
        },
        $order_by: [{ 
            $desc: 'id' 
        }],
        $where: {
            $or: [{
                $eq: ['id', { 
                    $escape: 1
                }]
            }],
            $any_path: [['variants'], {
                $in: ['ASIN', { 
                    $escape: ['a', 'b']
                }]
            }]
        }
    }
}

option 1 (object select and separate nest):
- allows user to choose inline (e.g. mysql does it in the select) subqueries, vs orma nested subqueries (done as separate queries)
- no $
- indentation is doubled from option 1
- possibility of selecting and nesting something with the same name (which is impossible to represent if the output is a json object)

{
    where_connected: [],
    nest: {
        items: {
            select: {
                id: true,
                my_sku: 'sku',
                _mutable: {
                    escape: false
                }
                lowercase_sku: {
                    lower: 'sku'
                }
            },
            nest: {
                my_variants: {
                    from: 'variants',
                    select: {
                        asin: true
                    },
                    nest: {
                        products: {
                            nest: {
                                vendors: {
                                    select: {
                                        name: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            order_by: [{ 
                desc: 'id' 
            }],
            where: {
                or: [{
                    eq: ['id', { 
                        escape: 1
                    }]
                }],
                any_path: [['variants'], {
                    in: ['ASIN', { 
                        escape: ['a', 'b']
                    }]
                }]
            }
        }
    }
}


option 2 (object select and combined nest):
- similar to option 1
- no clear way to do inline selects (maybe would need an extra keyword or something)
- slightly less lines of code than option 1
- impossible to select and nest something with the same name (since the query object matches the result object)
{
    where_connected: [],
    select: {
        items: {
            select: {
                id: true,
                my_sku: 'sku',
                _mutable: {
                    escape: false
                }
                lowercase_sku: {
                    lower: 'sku'
                },
                my_variants: {
                    from: 'variants',
                    select: {
                        asin: true
                        products: {
                            select: {
                                vendors: {
                                    select: {
                                        name: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            order_by: [{ 
                desc: 'id' 
            }],
            where: {
                or: [{
                    eq: ['id', { 
                        escape: 1
                    }]
                }],
                any_path: [['variants'], {
                    in: ['ASIN', { 
                        escape: ['a', 'b']
                    }]
                }]
            }
        }
    }
}

option 3 (array select and separate array nest):
- lose tons of typesafety due to arrays
- looks bad and confusing
- hard to work with programattically
  - find if something is selected
    - object: items.select.id
    - array: items.find(el => el === 'id' || el?.as?.[1] === 'id')
  - prop into something (in a way that wont break if something else is added to the query)
    - object: items.nest.variants.nest.vendors.select.name
    - array: items.nest
                  .find(el => el?.as[1] === 'my_variants')
                  ?.find(el => el.from === 'products')
                  ?.find(el => el.from === 'vendors')
                  ?.select?.find(el => el === 'name')
    - array code wont have proper type guarantees because find could return null
- query syntax allow selecting the same thing multiple times which in theory matches sql better, but the query output would also need to return an array instead of an object to take advantage of this
{
    nest: [{
        select: [
            'id', 
            { as: ['sku', 'my_sku'] },
            { 
                as: ['_mutable', {
                    escape: false
                }]
            },
            { 
                as: ['lowercase_sku', {
                    escape: 'sku'
                }]
            },
        ], 
        from: 'items',
        nest: [{
            $as: [{
                select: ['asin'],
                from: 'variants',
                nest: [{
                    from: 'products',
                    nest: [{
                        from: 'vendors',
                        select: ['name']
                    }]
                }]
            }, 'my_variants']
        }],
        order_by: [{ 
            desc: 'id' 
        }],
        where: {
            or: [{
                eq: ['id', { 
                    escape: 1
                }]
            }],
            any_path: [['variants'], {
                in: ['ASIN', { 
                    escape: ['a', 'b']
                }]
            }]
        }
    }]
}


Mutation syntax:
current:

{
    $operation: 'create'
    items: [{
        id: { $guid: 'a'},
        sku: '1234',
        variants: [{
            
        }]
    }]
}