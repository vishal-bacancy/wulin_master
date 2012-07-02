// master-detail grid relation, detail grid render the records which belongs to the selected row of master grid

WulinMaster.behaviors.Affiliation = $.extend({}, WulinMaster.behaviors.BaseBehavior, {
  event: "onSelectedRowsChanged",

  subscribe: function(target) {
    var self = this;

    this.detail_grids = this.detail_grids || [];
    if(this.detail_grids.indexOf(target) < 0) {
      this.detail_grids.push(target);
    }
    
    this.master_grid = gridManager.getGrid(self.master_grid_name);
    this.master_grid[this.event].subscribe(function(){ self.handler() });
  },

  unsubscribe: function() {

  },

  handler: function() {
    // get the selected id, then filter the detail grid
    var masterIds = this.master_grid.getSelectedIds();
    if(masterIds.length != 1) return false;

    var association_key = this.through;
    for(var i in this.detail_grids) {
      this.detail_grids[i].loader.addFilter(association_key, masterIds[0], this.operator);
    }
  }

});

WulinMaster.BehaviorManager.register("affiliation", WulinMaster.behaviors.Affiliation);