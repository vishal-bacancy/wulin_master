# frozen_string_literal: true

module WulinMaster
  def self.configure(configuration = WulinMaster::Configuration.new)
    yield configuration if block_given?
    @config = configuration
  end

  def self.config
    @config ||= WulinMaster::Configuration.new
  end

  class Configuration
    attr_accessor :app_title, :app_title_height, :always_reset_form,
                  :default_year, :color_theme, :button_mode, :nav_sidebar_partial_path,
                  :master_selection_color, :detail_color_theme, :detail_background_color, :default_color

    def initialize
      self.app_title = 'Undefined App'
      self.app_title_height = '42px'
      self.always_reset_form = false
      self.default_year = Time.zone ? Time.zone.today.year : nil
      self.color_theme = 'blue'
      self.button_mode = 'split'
      self.nav_sidebar_partial_path = ''
      self.master_selection_color = ''
      self.detail_color_theme = ''
      self.detail_background_color = ''
      self.default_color = 'teal'
    end

    def split_button_mode?
      button_mode == 'split'
    end

    def merged_button_mode?
      button_mode == 'merged'
    end
  end
end
