# frozen_string_literal: true

module WulinMaster
  class ToolbarItem
    @default_global_actions = %i[create add_detail switch show_all]

    class << self
      attr_reader :default_global_actions

      def add_default_global_actions(action)
        @default_global_actions << action
      end
    end

    attr_accessor :title, :javascript, :icon, :options

    def initialize(title, options = {})
      @title = title

      @javascript = options.delete(:javascript)
      @icon = options.delete(:icon)

      options[:href] = 'javascript:void(0);' unless options[:href]
      @options = options
    end

    def javascript?
      @javascript.present?
    end

    def icon?
      @icon.present?
    end

    def default_global_action?
      ToolbarItem.default_global_actions.include?(options[:name]&.to_sym)
    end

    def customized_global_action?
      options[:global]
    end

    def split_button_mode?
      WulinMaster.config.split_button_mode?
    end

    def global?
      customized_global_action? || default_global_action?
    end

    def global_unlder_split_button_mode?
      split_button_mode? && global?
    end

    def anchor_tag_options
      css_classes = if global_unlder_split_button_mode?
        ['waves-effect']
      else
        %w[waves-effect waves-circle tooltipped]
      end

      if icon?
        css_classes += options[:class].split(' ') if options[:class].present?
        # css_classes << "toolbar_icon_#{icon}" unless css_classes.include?("toolbar_icon_#{icon}")
        css_classes << "toolbar_manually_enable" if options[:manually_enable]
      else
        css_classes += options[:class].split(" ").delete_if { |e| e.include?('toolbar_icon') }
      end
      options[:class] = css_classes.uniq.join(' ')

      if javascript?
        options.merge!(href: '#',
                       onclick: javascript + "; return false;")
      else
        options.delete(:href)
        options.delete(:onclick)
      end

      if global_unlder_split_button_mode?
        options
      else
        options.merge('data-position': 'bottom', 'data-delay': '50', 'data-tooltip': @title)
      end
    end

    # Satisfy render_to_string
    def action_name
      ""
    end
  end
end
