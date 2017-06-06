require 'wulin_master/components/grid/toolbar_item'

module WulinMaster
  class Toolbar # < Array
    attr_reader :grid_name, :items

    def initialize(grid_name, actions = [])
      # self.class.default_items.each {|item| self.unshift(item) }
      @grid_name = grid_name
      @items ||= []

      default_icons = {
        add: 'add_box',
        excel: 'file_download',
        edit: 'mode_edit',
        delete: 'delete',
        audit: 'restore'
      }

      actions.each do |action|
        item_options = {
          id: "#{action[:name]}_action_on_#{grid_name}",
          class: ("#{action[:name]}_action " << action[:class].to_s),
          icon: (action[:icon] || default_icons[action[:name]]).to_s,
          manually_enable: action[:manually_enable]
        }
        item_options = action.merge(item_options)
        item_name = action[:title] || action[:name].capitalize

        @items << ToolbarItem.new(item_name, item_options)
      end
    end
  end
end
